import { supabase } from '../integrations/supabase/client';
import { Tables } from '../integrations/supabase/types';

export type TableQR = {
  table_id: string;
  table_number: string;
  table_name: string | null;
  qr_code_url: string | null;
  qr_code_generated_at: string | null;
  cafe_id: string;
};

export type GenerateQRResponse = {
  qr_url: string;
  table: TableQR;
};

export class QRTableService {
  /**
   * Generate QR code for a table
   */
  static async generateTableQR(tableId: string, cafeId: string): Promise<GenerateQRResponse> {
    const { data, error } = await supabase.rpc('generate_table_qr_code', {
      table_id: tableId,
      cafe_id: cafeId
    });

    if (error) {
      console.error('Error generating table QR code:', error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }

    // Fetch updated table details
    const { data: tableData, error: tableError } = await supabase
      .from('tables')
      .select('*')
      .eq('id', tableId)
      .single();

    if (tableError) {
      console.error('Error fetching table after QR generation:', tableError);
      throw new Error(`Failed to fetch table: ${tableError.message}`);
    }

    return {
      qr_url: data,
      table: tableData as TableQR
    };
  }

  /**
   * Get all tables with QR codes for a cafe
   */
  static async getTablesWithQR(cafeId: string): Promise<TableQR[]> {
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('table_number');

    if (error) {
      console.error('Error fetching tables with QR:', error);
      throw new Error(`Failed to fetch tables: ${error.message}`);
    }

    return data as TableQR[];
  }

  /**
   * Download QR code as PNG
   */
  static async downloadQRCode(qrUrl: string, fileName: string): Promise<void> {
    try {
      // Use a QR code generation library on the frontend
      // For now, we'll create a simple download link
      const link = document.createElement('a');
      link.href = qrUrl;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      throw new Error('Failed to download QR code');
    }
  }

  /**
   * Print QR code poster
   */
  static async printQRPoster(table: TableQR): Promise<void> {
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Could not open print window');
      }

      const qrContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Table ${table.table_number} QR Code - ${table.table_name || 'Table'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
            .poster { max-width: 800px; margin: 0 auto; padding: 20px; border: 2px solid #333; }
            h1 { color: #333; margin-bottom: 10px; }
            .subtitle { color: #666; margin-bottom: 30px; }
            .qr-container { margin: 30px 0; }
            .instructions { margin-top: 30px; color: #555; font-size: 16px; line-height: 1.5; }
            .footer { margin-top: 40px; color: #999; font-size: 14px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="poster">
            <h1>Table ${table.table_number}</h1>
            ${table.table_name ? `<div class="subtitle">${table.table_name}</div>` : ''}
            
            <div class="qr-container">
              <img src="${table.qr_code_url || ''}" alt="QR Code" width="300" height="300">
            </div>
            
            <div class="instructions">
              <p><strong>Scan to:</strong></p>
              <p>• View menu & order directly</p>
              <p>• Call staff assistance</p>
              <p>• Request bill & pay</p>
            </div>
            
            <div class="footer">
              <p>Powered by Orderly Cafe System</p>
              <p>Generated on ${new Date().toLocaleDateString()}</p>
            </div>
            
            <div class="no-print" style="margin-top: 30px;">
              <button onclick="window.print()">Print Poster</button>
              <button onclick="window.close()">Close</button>
            </div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(qrContent);
      printWindow.document.close();
    } catch (error) {
      console.error('Error printing QR poster:', error);
      throw new Error('Failed to print QR poster');
    }
  }

  /**
   * Check if QR codes are enabled for a cafe
   */
  static async isQREnabled(cafeId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('cafes')
      .select('table_qr_codes_enabled')
      .eq('id', cafeId)
      .single();

    if (error) {
      console.error('Error checking QR enabled status:', error);
      return false;
    }

    return data?.table_qr_codes_enabled ?? true;
  }

  /**
   * Bulk generate QR codes for all tables in a cafe
   */
  static async bulkGenerateQRCodes(cafeId: string): Promise<GenerateQRResponse[]> {
    // Get all tables without QR codes
    const { data: tables, error } = await supabase
      .from('tables')
      .select('*')
      .eq('cafe_id', cafeId)
      .is('qr_code_url', null);

    if (error) {
      console.error('Error fetching tables for bulk generation:', error);
      throw new Error(`Failed to fetch tables: ${error.message}`);
    }

    const results: GenerateQRResponse[] = [];
    
    for (const table of tables) {
      try {
        const result = await this.generateTableQR(table.id, cafeId);
        results.push(result);
      } catch (err) {
        console.error(`Failed to generate QR for table ${table.table_number}:`, err);
      }
    }

    return results;
  }
}