import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  Price,
  CreatePriceRequest,
  CursorPage,
} from "./types.js";

export type ListProductsQuery = {
  cursor?: string;
  limit?: number;
  active?: boolean;
};

export class ProductsResource {
  constructor(private readonly http: HttpClient) {}

  async list(query?: ListProductsQuery): Promise<CursorPage<Product>> {
    return this.http.request("/products", { query });
  }

  async retrieve(productId: string): Promise<Product> {
    const resp = await this.http.request<unknown>(
      `/products/${encodeURIComponent(productId)}`,
    );
    return unwrap<Product>(resp, "product");
  }

  async create(
    input: CreateProductRequest,
    opts?: ResourceCallOpts,
  ): Promise<Product> {
    const resp = await this.http.request<unknown>("/products", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<Product>(resp, "product");
  }

  async update(
    productId: string,
    input: UpdateProductRequest,
  ): Promise<Product> {
    const resp = await this.http.request<unknown>(
      `/products/${encodeURIComponent(productId)}`,
      { method: "PATCH", body: input },
    );
    return unwrap<Product>(resp, "product");
  }

  // Prices are nested under products.

  listPrices(productId: string): Promise<{ data: Price[] }> {
    return this.http.request(
      `/products/${encodeURIComponent(productId)}/prices`,
    );
  }

  async createPrice(
    productId: string,
    input: CreatePriceRequest,
    opts?: ResourceCallOpts,
  ): Promise<Price> {
    const resp = await this.http.request<unknown>(
      `/products/${encodeURIComponent(productId)}/prices`,
      {
        method: "POST",
        body: input,
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
    return unwrap<Price>(resp, "price");
  }

  /**
   * Hard-delete a product. Returns 409 if any subscription still references
   * it; clean up the dependent subscriptions first.
   */
  delete(productId: string): Promise<void> {
    return this.http.request(`/products/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    });
  }

  /**
   * Hard-delete a price. Returns 409 if any subscription still references
   * it; clean up the dependent subscriptions first.
   *
   * The API returns 204 No Content on success — this method resolves to
   * `void` (matching {@link ProductsResource.delete}). It does **not**
   * return the deleted `Price`.
   */
  deletePrice(priceId: string): Promise<void> {
    return this.http.request(`/prices/${encodeURIComponent(priceId)}`, {
      method: "DELETE",
    });
  }
}
