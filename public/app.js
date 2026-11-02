const rows = document.getElementById("productRows");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const message = document.getElementById("message");
const formPanel = document.getElementById("formPanel");
const productForm = document.getElementById("productForm");

function money(value) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function loadSummary() {
  const summary = await api("/api/summary");
  document.getElementById("totalProducts").textContent = summary.totalProducts;
  document.getElementById("totalUnits").textContent = summary.totalUnits;
  document.getElementById("inventoryValue").textContent = money(summary.inventoryValue);
}

async function loadCategories() {
  const categories = await api("/api/categories");
  const selected = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">All categories</option>';
  categories.forEach(item => {
    const option = document.createElement("option");
    option.value = item.category;
    option.textContent = item.category;
    categoryFilter.appendChild(option);
  });
  categoryFilter.value = selected;
}

function makeCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

async function loadProducts() {
  try {
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (categoryFilter.value) params.set("category", categoryFilter.value);
    const products = await api(`/api/products?${params.toString()}`);
    rows.replaceChildren();
    if (!products.length) {
      const tr = document.createElement("tr");
      const td = makeCell("No products found. Try a different search or add a product.");
      td.colSpan = 5; tr.appendChild(td); rows.appendChild(tr);
      return;
    }
    products.forEach(product => {
      const tr = document.createElement("tr");
      tr.appendChild(makeCell(product.name));
      tr.appendChild(makeCell(product.category));
      tr.appendChild(makeCell(money(product.price)));
      tr.appendChild(makeCell(product.stock));
      const actions = document.createElement("td");
      const wrap = document.createElement("div"); wrap.className = "action-buttons";
      const edit = document.createElement("button"); edit.className = "small-btn"; edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(product));
      const del = document.createElement("button"); del.className = "small-btn delete-btn"; del.textContent = "Delete";
      del.addEventListener("click", () => deleteProduct(product.id, product.name));
      wrap.append(edit, del); actions.appendChild(wrap); tr.appendChild(actions); rows.appendChild(tr);
    });
  } catch (error) { showMessage(error.message, true); }
}

async function refresh() {
  await Promise.all([loadCategories(), loadProducts(), loadSummary()]);
}

function openForm(product = null) {
  productForm.reset();
  document.getElementById("productId").value = product ? product.id : "";
  document.getElementById("formTitle").textContent = product ? "Edit product" : "Add product";
  document.getElementById("saveBtn").textContent = product ? "Update product" : "Save product";
  if (product) {
    document.getElementById("name").value = product.name;
    document.getElementById("category").value = product.category;
    document.getElementById("price").value = product.price;
    document.getElementById("stock").value = product.stock;
  }
  formPanel.hidden = false;
  formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("name").focus();
}

function startEdit(product) { openForm(product); }

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await api(`/api/products/${id}`, { method: "DELETE" });
    showMessage("Product deleted successfully.");
    await refresh();
  } catch (error) { showMessage(error.message, true); }
}

document.getElementById("newProductBtn").addEventListener("click", () => openForm());
document.getElementById("cancelBtn").addEventListener("click", () => { formPanel.hidden = true; });
searchInput.addEventListener("input", () => loadProducts().catch(error => showMessage(error.message, true)));
categoryFilter.addEventListener("change", () => loadProducts().catch(error => showMessage(error.message, true)));

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  const id = document.getElementById("productId").value;
  const product = {
    name: document.getElementById("name").value.trim(),
    category: document.getElementById("category").value.trim(),
    price: Number(document.getElementById("price").value),
    stock: Number(document.getElementById("stock").value)
  };
  try {
    await api(id ? `/api/products/${id}` : "/api/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(product)
    });
    formPanel.hidden = true;
    showMessage(id ? "Product updated successfully." : "Product added successfully.");
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

refresh().catch(error => showMessage(error.message, true));