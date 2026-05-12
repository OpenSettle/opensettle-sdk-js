import type { HttpClient } from "../http.js";
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

  list(query?: ListProductsQuery): Promise<CursorPage<Product>> {
    return this.http.request("/products", { query });
  }

  retrieve(productId: string): Promise<Product> {
    return this.http.request(`/products/${encodeURIComponent(productId)}`);
  }

  create(input: CreateProductRequest): Promise<Product> {
    return this.http.request("/products", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  update(productId: string, input: UpdateProductRequest): Promise<Product> {
    return this.http.request(`/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: input,
    });
  }

  // Prices are nested under products.

  listPrices(
    productId: string,
  ): Promise<{ data: Price[] }> {
    return this.http.request(
      `/products/${encodeURIComponent(productId)}/prices`,
    );
  }

  createPrice(
    productId: string,
    input: CreatePriceRequest,
  ): Promise<Price> {
    return this.http.request(
      `/products/${encodeURIComponent(productId)}/prices`,
      { method: "POST", body: input, idempotencyKey: true },
    );
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
   */
  deletePrice(priceId: string): Promise<void> {
    return this.http.request(`/prices/${encodeURIComponent(priceId)}`, {
      method: "DELETE",
    });
  }
}
