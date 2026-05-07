/**
 * tableManagementService — table status management for cafes
 * Provides functions to manage tables, update status, assign orders/bookings
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Table = Database["public"]["Tables"]["tables"]["Row"];
export type TableStatus = Database["public"]["Enums"]["table_status"];

export type CreateTableInput = {
  cafeId: string;
  tableNumber: string;
  tableName?: string;
  capacity: number;
  locationDescription?: string;
  qrCodeUrl?: string;
  notes?: string;
};

export type UpdateTableStatusInput = {
  tableId: string;
  status: TableStatus;
  orderId?: string | null;
  bookingId?: string | null;
};

export type AvailableTableFilter = {
  cafeId: string;
  persons: number;
  bookingDate?: string;
  bookingTime?: string;
};

export class TableManagementService {
  /**
   * Get all tables for a cafe
   */
  static async getTables(cafeId: string): Promise<Table[]> {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("table_number");

    if (error) {
      console.error("Error fetching tables:", error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get a single table by ID
   */
  static async getTable(tableId: string): Promise<Table | null> {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("id", tableId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching table:", error);
      throw error;
    }

    return data;
  }

  /**
   * Create a new table
   */
  static async createTable(input: CreateTableInput): Promise<Table> {
    const { data, error } = await supabase
      .from("tables")
      .insert({
        cafe_id: input.cafeId,
        table_number: input.tableNumber,
        table_name: input.tableName,
        capacity: input.capacity,
        location_description: input.locationDescription,
        qr_code_url: input.qrCodeUrl,
        notes: input.notes,
        status: "available",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating table:", error);
      throw error;
    }

    return data;
  }

  /**
   * Update table status
   */
  static async updateTableStatus(input: UpdateTableStatusInput): Promise<Table> {
    const { data, error } = await supabase.rpc("update_table_status", {
      _table_id: input.tableId,
      _status: input.status,
      _order_id: input.orderId,
      _booking_id: input.bookingId,
    });

    if (error) {
      console.error("Error updating table status:", error);
      throw error;
    }

    // Fetch the updated table
    const table = await this.getTable(input.tableId);
    if (!table) {
      throw new Error("Table not found after update");
    }

    return table;
  }

  /**
   * Get available tables for a booking
   */
  static async getAvailableTables(filter: AvailableTableFilter): Promise<Table[]> {
    const { data, error } = await supabase.rpc("get_available_tables", {
      _cafe_id: filter.cafeId,
      _persons: filter.persons,
      _booking_date: filter.bookingDate || null,
      _booking_time: filter.bookingTime || null,
    });

    if (error) {
      console.error("Error fetching available tables:", error);
      throw error;
    }

    return data || [];
  }

  /**
   * Assign order to table
   */
  static async assignOrderToTable(tableId: string, orderId: string): Promise<Table> {
    return this.updateTableStatus({
      tableId,
      status: "occupied",
      orderId,
      bookingId: null,
    });
  }

  /**
   * Assign booking to table
   */
  static async assignBookingToTable(tableId: string, bookingId: string): Promise<Table> {
    return this.updateTableStatus({
      tableId,
      status: "reserved",
      orderId: null,
      bookingId,
    });
  }

  /**
   * Clear table (make available)
   */
  static async clearTable(tableId: string): Promise<Table> {
    return this.updateTableStatus({
      tableId,
      status: "available",
      orderId: null,
      bookingId: null,
    });
  }

  /**
   * Mark table for cleaning
   */
  static async markTableForCleaning(tableId: string): Promise<Table> {
    return this.updateTableStatus({
      tableId,
      status: "cleaning",
      orderId: null,
      bookingId: null,
    });
  }

  /**
   * Mark table as out of service
   */
  static async markTableOutOfService(tableId: string): Promise<Table> {
    return this.updateTableStatus({
      tableId,
      status: "out_of_service",
      orderId: null,
      bookingId: null,
    });
  }

  /**
   * Update table details
   */
  static async updateTable(tableId: string, updates: Partial<Table>): Promise<Table> {
    const { data, error } = await supabase
      .from("tables")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tableId)
      .select()
      .single();

    if (error) {
      console.error("Error updating table:", error);
      throw error;
    }

    return data;
  }

  /**
   * Delete table
   */
  static async deleteTable(tableId: string): Promise<void> {
    const { error } = await supabase
      .from("tables")
      .delete()
      .eq("id", tableId);

    if (error) {
      console.error("Error deleting table:", error);
      throw error;
    }
  }

  /**
   * Get table status summary for a cafe
   */
  static async getTableStatusSummary(cafeId: string): Promise<Record<TableStatus, number>> {
    const tables = await this.getTables(cafeId);
    
    const summary: Record<TableStatus, number> = {
      available: 0,
      occupied: 0,
      reserved: 0,
      cleaning: 0,
      out_of_service: 0,
    };

    tables.forEach(table => {
      summary[table.status] = (summary[table.status] || 0) + 1;
    });

    return summary;
  }

  /**
   * Get tables by status
   */
  static async getTablesByStatus(cafeId: string, status: TableStatus): Promise<Table[]> {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("cafe_id", cafeId)
      .eq("status", status)
      .order("table_number");

    if (error) {
      console.error("Error fetching tables by status:", error);
      throw error;
    }

    return data || [];
  }
}