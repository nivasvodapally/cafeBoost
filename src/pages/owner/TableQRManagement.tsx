import { useEffect, useState, useCallback } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { 
  QrCode, Plus, Download, Printer, Copy, Check, Loader2, 
  Table as TableIcon, Users, MapPin, RefreshCw, Eye, EyeOff,
  Edit, Trash2, CheckCircle, XCircle, Clock
} from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { TableManagementService, type Table, type TableStatus } from "@/services/tableManagementService";
import { toast } from "sonner";
import QRCode from "qrcode";
import { qrUrl } from "@/services/qrService";

export default function TableQRManagement() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [newTable, setNewTable] = useState({
    tableNumber: "",
    tableName: "",
    capacity: 4,
    locationDescription: "",
    notes: ""
  });
  const [isCreating, setIsCreating] = useState(false);

  const fetchTables = useCallback(async () => {
    if (!cafe?.id) return;
    
    setLoading(true);
    try {
      const tablesData = await TableManagementService.getTables(cafe.id);
      setTables(tablesData);
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("Failed to load tables");
    } finally {
      setLoading(false);
    }
  }, [cafe?.id]);

  useEffect(() => {
    if (cafe?.id) {
      void fetchTables();
    }
  }, [cafe?.id, fetchTables]);

  const handleCreateTable = async () => {
    if (!cafe?.id) return;
    
    setIsCreating(true);
    try {
      await TableManagementService.createTable({
        cafeId: cafe.id,
        tableNumber: newTable.tableNumber,
        tableName: newTable.tableName || undefined,
        capacity: newTable.capacity,
        locationDescription: newTable.locationDescription || undefined,
        notes: newTable.notes || undefined
      });
      
      toast.success(`Table ${newTable.tableNumber} created`);
      setNewTable({
        tableNumber: "",
        tableName: "",
        capacity: 4,
        locationDescription: "",
        notes: ""
      });
      fetchTables();
    } catch (error) {
      console.error("Error creating table:", error);
      toast.error("Failed to create table");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateStatus = async (tableId: string, status: TableStatus) => {
    try {
      await TableManagementService.updateTableStatus({
        tableId,
        status
      });
      toast.success("Table status updated");
      fetchTables();
    } catch (error) {
      console.error("Error updating table status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm("Are you sure you want to delete this table? This action cannot be undone.")) return;
    
    try {
      await TableManagementService.deleteTable(tableId);
      toast.success("Table deleted");
      fetchTables();
    } catch (error) {
      console.error("Error deleting table:", error);
      toast.error("Failed to delete table");
    }
  };

  const getTableQRUrl = (table: Table) => {
    const slug = cafe?.slug ?? "your-cafe";
    return `${qrUrl(slug, "main")}/table/${encodeURIComponent(table.table_number)}`;
  };

  const downloadTableQR = async (table: Table) => {
    const url = getTableQRUrl(table);
    const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${cafe?.slug || "cafe"}-table-${table.table_number}-qr.png`;
    a.click();
    toast.success(`QR code for Table ${table.table_number} downloaded`);
  };

  const printTableQR = async (table: Table) => {
    const url = getTableQRUrl(table);
    const dataUrl = await QRCode.toDataURL(url, { width: 720, margin: 2 });
    const w = window.open("", "_blank");
    if (!w) return;
    
    w.document.write(`
      <html>
        <head>
          <title>${cafe?.name ?? "Cafe"} — Table ${table.table_number} QR</title>
          <style>
            body {
              font-family: 'Helvetica Neue', system-ui, sans-serif;
              text-align: center;
              padding: 80px 24px;
              color: #1a1a1a;
              background: #faf7f2;
            }
            h1 {
              font-size: 42px;
              margin-bottom: 8px;
              letter-spacing: -.02em;
            }
            h2 {
              font-size: 18px;
              color: #7a6f5f;
              margin-top: 0;
              font-weight: 500;
            }
            img {
              margin: 36px auto;
              display: block;
              max-width: 380px;
              border-radius: 24px;
              box-shadow: 0 10px 40px rgba(0,0,0,.08);
            }
            p {
              color: #9a8e7d;
              font-size: 11px;
              font-family: 'SF Mono', monospace;
              word-break: break-all;
              margin-top: 20px;
            }
            .footer {
              margin-top: 48px;
              font-size: 13px;
              color: #7a6f5f;
              font-weight: 500;
            }
            .table-info {
              background: white;
              padding: 20px;
              border-radius: 12px;
              margin: 20px auto;
              max-width: 400px;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <h1>${cafe?.name ?? "Cafe"}</h1>
          <h2>Table ${table.table_number} • Scan to order</h2>
          <div class="table-info">
            <p><strong>Table:</strong> ${table.table_number} ${table.table_name ? `(${table.table_name})` : ''}</p>
            <p><strong>Capacity:</strong> ${table.capacity} persons</p>
            ${table.location_description ? `<p><strong>Location:</strong> ${table.location_description}</p>` : ''}
          </div>
          <img src="${dataUrl}" alt="QR"/>
          <p>${url}</p>
          <div class="footer">Powered by CafeBoost</div>
          <script>window.print()</script>
        </body>
      </html>
    `);
  };

  const copyTableLink = async (table: Table) => {
    const url = getTableQRUrl(table);
    await navigator.clipboard.writeText(url);
    setCopiedTableId(table.id);
    toast.success("Table link copied to clipboard");
    setTimeout(() => setCopiedTableId(null), 1500);
  };

  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case "available": return "bg-success/15 text-success";
      case "occupied": return "bg-destructive/15 text-destructive";
      case "reserved": return "bg-warning/15 text-warning";
      case "cleaning": return "bg-blue-500/15 text-blue-500";
      case "out_of_service": return "bg-gray-500/15 text-gray-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: TableStatus) => {
    switch (status) {
      case "available": return <CheckCircle className="w-4 h-4" />;
      case "occupied": return <Users className="w-4 h-4" />;
      case "reserved": return <Clock className="w-4 h-4" />;
      case "cleaning": return <RefreshCw className="w-4 h-4" />;
      case "out_of_service": return <XCircle className="w-4 h-4" />;
      default: return <TableIcon className="w-4 h-4" />;
    }
  };

  if (cafeLoading || loading) {
    return (
      <OwnerLayout title="Table QR Management" subtitle="Managing table QR codes">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading tables...</p>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout 
      title="Table QR Management" 
      subtitle={`${tables.length} tables • ${cafe?.name || 'Your Cafe'}`}
      action={
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Table</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tableNumber">Table Number *</Label>
                <Input
                  id="tableNumber"
                  placeholder="e.g., T1, 12, A5"
                  value={newTable.tableNumber}
                  onChange={(e) => setNewTable({...newTable, tableNumber: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tableName">Table Name (Optional)</Label>
                <Input
                  id="tableName"
                  placeholder="e.g., Window View, Corner Booth"
                  value={newTable.tableName}
                  onChange={(e) => setNewTable({...newTable, tableName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  max="20"
                  value={newTable.capacity}
                  onChange={(e) => setNewTable({...newTable, capacity: parseInt(e.target.value) || 4})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location Description</Label>
                <Input
                  id="location"
                  placeholder="e.g., Near entrance, Outdoor patio"
                  value={newTable.locationDescription}
                  onChange={(e) => setNewTable({...newTable, locationDescription: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  placeholder="Any special notes about this table"
                  value={newTable.notes}
                  onChange={(e) => setNewTable({...newTable, notes: e.target.value})}
                />
              </div>
              <Button 
                onClick={handleCreateTable} 
                disabled={isCreating || !newTable.tableNumber}
                className="w-full gap-2"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Table
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tables</p>
                <p className="text-2xl font-bold">{tables.length}</p>
              </div>
              <TableIcon className="w-8 h-8 text-primary/30" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold">
                  {tables.filter(t => t.status === "available").length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-success/30" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Occupied</p>
                <p className="text-2xl font-bold">
                  {tables.filter(t => t.status === "occupied").length}
                </p>
              </div>
              <Users className="w-8 h-8 text-destructive/30" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">With QR</p>
                <p className="text-2xl font-bold">
                  {tables.filter(t => t.qr_code_url).length}
                </p>
              </div>
              <QrCode className="w-8 h-8 text-blue-500/30" />
            </div>
          </Card>
        </div>

        {/* Tables Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((table) => (
            <Card key={table.id} className="p-5 overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TableIcon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">
                      Table {table.table_number}
                      {table.table_name && (
                        <span className="text-muted-foreground ml-2">({table.table_name})</span>
                      )}
                    </h3>
                  </div>
                  <Badge className={`gap-1 ${getStatusColor(table.status)}`}>
                    {getStatusIcon(table.status)}
                    {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedTable(table);
                      setShowQRDialog(true);
                    }}
                    title="View QR"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTable(table.id)}
                    title="Delete table"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span>Capacity: {table.capacity} persons</span>
                </div>
                {table.location_description && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{table.location_description}</span>
                  </div>
                )}
                {table.notes && (
                  <p className="text-sm text-muted-foreground">{table.notes}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => downloadTableQR(table)}
                >
                  <Download className="w-3 h-3" />
                  QR
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => printTableQR(table)}
                >
                  <Printer className="w-3 h-3" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => copyTableLink(table)}
                >
                  {copiedTableId === table.id ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Link
                </Button>
              </div>

              {/* Status Quick Actions */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Quick Status:</p>
                <div className="flex flex-wrap gap-1">
                  {["available", "occupied", "reserved", "cleaning", "out_of_service"].map((status) => (
                    <Button
                      key={status}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${table.status === status ? "bg-primary/10 border-primary" : ""}`}
                      onClick={() => handleUpdateStatus(table.id, status as TableStatus)}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* QR Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Table QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code to access Table {selectedTable?.table_number}
            </DialogDescription>
          </DialogHeader>
          {selectedTable && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-lg border flex justify-center">
                <img 
                  src={QRCode.createDataURL(getTableQRUrl(selectedTable), { width: 256, margin: 1 })}
                  alt={`QR Code for Table ${selectedTable.table_number}`}
                  className="w-64 h-64"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Table Details</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Table Number:</div>
                  <div className="font-medium">{selectedTable.table_number}</div>
                  <div className="text-muted-foreground">Status:</div>
                  <div>
                    <Badge className={getStatusColor(selectedTable.status)}>
                      {selectedTable.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">Capacity:</div>
                  <div className="font-medium">{selectedTable.capacity} persons</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => selectedTable && downloadTableQR(selectedTable)}
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => selectedTable && printTableQR(selectedTable)}
                >
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => selectedTable && copyTableLink(selectedTable)}
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}