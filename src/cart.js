import { t, nameOf, number, money } from "./i18n.js";
import { esc, icon, image } from "./ui.js";
import { placeOrder } from "./store.js";
import m from "./styles/magazine.module.css";
import s from "./styles/ui.module.css";

const STORAGE_PREFIX = "clinic-cart-v1:";
const MAX_QUANTITY = 9999;
const SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let accountId = "";
let items = new Map();
let submissionId = "";

function newSubmissionId() {
  return globalThis.crypto.randomUUID();
}

function storageKey(id = accountId) {
  return id ? `${STORAGE_PREFIX}${id}` : "";
}

function normalizeItems(value) {
  const rows = Array.isArray(value) ? value : [];
  return new Map(
    rows
      .filter(
        (row) =>
          row &&
          typeof row.product_id === "string" &&
          row.product_id.length <= 80 &&
          Number.isInteger(row.quantity) &&
          row.quantity > 0 &&
          row.quantity <= MAX_QUANTITY,
      )
      .map((row) => [row.product_id, row.quantity]),
  );
}

function persist() {
  const key = storageKey();
  if (!key) return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        submission_id: cartSubmissionId(),
        items: [...items].map(([product_id, quantity]) => ({
          product_id,
          quantity,
        })),
      }),
    );
  } catch {
    // Keep the current cart usable in memory if browser storage is unavailable.
  }
}

function announceChange() {
  // A changed payload is a new logical submission; retries keep this ID.
  submissionId = newSubmissionId();
  persist();
  window.dispatchEvent(new Event("clinic-cart-change"));
}

export function setCartAccount(nextAccountId) {
  const next = String(nextAccountId || "");
  if (next === accountId) return;
  accountId = next;
  items = new Map();
  submissionId = newSubmissionId();
  const key = storageKey(next);
  if (!key) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    items = normalizeItems(Array.isArray(saved) ? saved : saved?.items);
    if (SUBMISSION_ID_PATTERN.test(saved?.submission_id || ""))
      submissionId = saved.submission_id;
    persist();
  } catch {
    items = new Map();
    submissionId = newSubmissionId();
  }
}

export function getCart() {
  return [...items].map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }));
}

export function cartCount() {
  return [...items.values()].reduce((sum, quantity) => sum + quantity, 0);
}

export function cartSubmissionId() {
  if (!SUBMISSION_ID_PATTERN.test(submissionId))
    submissionId = newSubmissionId();
  return submissionId;
}

export function addToCart(productId) {
  const id = String(productId || "");
  if (!id || id.length > 80) return;
  items.set(id, Math.min(MAX_QUANTITY, (items.get(id) || 0) + 1));
  announceChange();
}

export function changeCartQuantity(productId, delta) {
  const id = String(productId || "");
  const current = items.get(id);
  if (!current || ![-1, 1].includes(delta)) return;
  const next = current + delta;
  if (next <= 0) items.delete(id);
  else items.set(id, Math.min(MAX_QUANTITY, next));
  announceChange();
}

export function removeFromCart(productId) {
  if (items.delete(String(productId || ""))) announceChange();
}

export function clearCart() {
  items.clear();
  submissionId = newSubmissionId();
  const key = storageKey();
  if (key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // In-memory cart state is still cleared.
    }
  }
  window.dispatchEvent(new Event("clinic-cart-change"));
}

function currentProducts(data) {
  return new Map(data.products.map((product) => [product.id, product]));
}

function dialogContents(data, state = {}) {
  if (state.success) {
    return `<section class="${m.cartSuccess}" role="status"><span class="${m.cartSuccessMark}">${icon("check")}</span><h3>${t("orderSuccess")}</h3><p>${t("orderSuccessText")}</p><button type="button" class="${s.button} ${s.primary}" data-cart-close>${t("continueShopping")}</button></section>`;
  }

  const products = currentProducts(data);
  let total = 0;
  let unavailable = false;
  const rows = getCart().map(({ product_id, quantity }) => {
    const product = products.get(product_id);
    if (!product) {
      unavailable = true;
      return `<li class="${m.cartItem} ${m.cartItemUnavailable}"><div class="${m.cartItemCopy}"><strong>${t("cartProductUnavailable")}</strong><p>${t("cartUnavailableText")}</p></div><button type="button" class="${m.cartRemove}" data-cart-remove="${esc(product_id)}" aria-label="${t("removeFromCart")}" ${state.busy ? "disabled" : ""}>${icon("close")}</button></li>`;
    }
    const price = Number(product.final_price) || 0;
    const lineTotal = price * quantity;
    total += lineTotal;
    const productName = nameOf(product);
    return `<li class="${m.cartItem}"><span class="${m.cartImage}">${image(product.img_url, productName)}</span><div class="${m.cartItemCopy}"><strong><bdi>${esc(productName)}</bdi></strong><span class="${m.cartItemPrice}">${money(price)}</span><div class="${m.cartQuantity}" aria-label="${t("quantity")}"><button type="button" data-cart-decrease="${esc(product_id)}" aria-label="${t("decreaseQuantity")}: ${esc(productName)}" ${state.busy ? "disabled" : ""}>−</button><output>${number(quantity)}</output><button type="button" data-cart-increase="${esc(product_id)}" aria-label="${t("increaseQuantity")}: ${esc(productName)}" ${state.busy ? "disabled" : ""}>+</button></div></div><div class="${m.cartLineTotal}"><bdi>${money(lineTotal)}</bdi><button type="button" class="${m.cartRemove}" data-cart-remove="${esc(product_id)}" aria-label="${t("removeFromCart")}: ${esc(productName)}" ${state.busy ? "disabled" : ""}>${icon("close")}</button></div></li>`;
  });
  const hasItems = rows.length > 0;
  const error = state.error
    ? `<p class="${s.error}" role="alert">${state.error}</p>`
    : "";
  return `<div class="${m.cartItemsWrap}">${hasItems ? `<ul class="${m.cartItems}">${rows.join("")}</ul>` : `<div class="${m.cartEmpty}">${icon("bag")}<p>${t("cartEmpty")}</p></div>`}</div>${error}<footer class="${m.cartFooter}"><div><span>${t("subtotal")}</span><strong><bdi>${money(total)}</bdi></strong></div><p>${t("cartNoPaymentNote")}</p><button type="button" class="${s.button} ${s.primary} ${m.cartCheckout}" data-cart-checkout ${!hasItems || unavailable || state.busy ? "disabled" : ""} ${state.busy ? 'aria-busy="true"' : ""}>${state.busy ? t("submittingOrder") : t("checkout")}${icon("arrow", m.cartArrow)}</button></footer>`;
}

export function cartDialog(data) {
  return `<dialog id="shopping-cart-dialog" class="${m.cartDialog}" aria-labelledby="cart-title"><div class="${m.cartPanel}"><header class="${m.cartHeader}"><div><span>${t("cartEyebrow")}</span><h2 id="cart-title">${t("cart")}</h2></div><button type="button" class="${s.iconButton}" data-cart-close aria-label="${t("closeCart")}">${icon("close")}</button></header><div id="cart-dialog-content" class="${m.cartDialogContent}">${dialogContents(data)}</div></div></dialog>`;
}

function refreshCount(root) {
  const count = cartCount();
  const control = root.querySelector("#cart-open");
  const badge = root.querySelector("#cart-count");
  if (badge) badge.textContent = number(count);
  if (control) {
    control.setAttribute("aria-label", `${t("cart")} (${number(count)})`);
    control.toggleAttribute("data-has-items", count > 0);
  }
}

export function bindCart(root, data, signal) {
  const dialog = root.querySelector("#shopping-cart-dialog");
  const content = root.querySelector("#cart-dialog-content");
  if (!dialog || !content) return;

  const renderContents = (state = {}) => {
    const active = content.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focusAttribute = active
      ? ["data-cart-increase", "data-cart-decrease", "data-cart-remove"].find(
          (attribute) => active.hasAttribute(attribute),
        )
      : null;
    const focusValue = focusAttribute
      ? active.getAttribute(focusAttribute)
      : null;
    dialog.dataset.busy = state.busy ? "true" : "false";
    dialog
      .querySelector("[data-cart-close]")
      ?.toggleAttribute("disabled", Boolean(state.busy));
    content.innerHTML = dialogContents(data, state);
    if (focusAttribute) {
      const next = [...content.querySelectorAll(`[${focusAttribute}]`)].find(
        (element) => element.getAttribute(focusAttribute) === focusValue,
      );
      (next || dialog.querySelector("[data-cart-close]"))?.focus();
    }
  };
  const open = () => {
    renderContents();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-cart-close]")?.focus();
  };

  root.querySelector("#cart-open")?.addEventListener("click", open, {
    signal,
  });
  root.addEventListener(
    "clinic-cart-add",
    (event) => {
      const addButton = event.target.closest("[data-cart-add]");
      if (!addButton) return;
      addToCart(addButton.dataset.cartAdd);
      addButton.setAttribute("aria-label", t("addedToCart"));
      addButton.classList.add(m.cartAdded);
      window.setTimeout(() => {
        if (addButton.isConnected) {
          addButton.setAttribute("aria-label", t("addToCart"));
          addButton.classList.remove(m.cartAdded);
        }
      }, 1200);
    },
    { signal },
  );
  window.addEventListener(
    "clinic-cart-change",
    () => {
      refreshCount(root);
      if (dialog.open) renderContents();
    },
    { signal },
  );
  root.addEventListener(
    "click",
    async (event) => {
      const close = event.target.closest("[data-cart-close]");
      if (close) {
        if (dialog.dataset.busy === "true") return;
        dialog.close();
        return;
      }
      const remove = event.target.closest("[data-cart-remove]");
      if (remove) {
        removeFromCart(remove.dataset.cartRemove);
        return;
      }
      const increase = event.target.closest("[data-cart-increase]");
      if (increase) {
        changeCartQuantity(increase.dataset.cartIncrease, 1);
        return;
      }
      const decrease = event.target.closest("[data-cart-decrease]");
      if (decrease) {
        changeCartQuantity(decrease.dataset.cartDecrease, -1);
        return;
      }
      const checkout = event.target.closest("[data-cart-checkout]");
      if (!checkout || checkout.disabled) return;

      const itemsToPlace = getCart();
      if (!itemsToPlace.length) return;
      checkout.disabled = true;
      checkout.setAttribute("aria-busy", "true");
      checkout.textContent = t("submittingOrder");
      renderContents({ busy: true });
      try {
        await placeOrder(itemsToPlace, cartSubmissionId());
        clearCart();
        renderContents({ success: true });
        dialog.querySelector("[data-cart-close]")?.focus();
      } catch {
        renderContents({ error: t("orderFailed") });
      }
    },
    { signal },
  );

  dialog.addEventListener(
    "click",
    (event) => {
      if (event.target === dialog && dialog.dataset.busy !== "true")
        dialog.close();
    },
    { signal },
  );
  dialog.addEventListener(
    "cancel",
    (event) => {
      if (dialog.dataset.busy === "true") event.preventDefault();
    },
    { signal },
  );
  refreshCount(root);
}
