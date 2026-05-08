import { useEffect, useRef, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Download, Loader2, Printer, Copy, Check, Sparkles, Table as TableIcon, Plus, Users, MapPin, RefreshCw, Eye, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { TableManagementService, type Table, type TableStatus } from "@/services/tableManagementService";
import QRCode from "qrcode";
import { qrUrl, qrPath } from "@/services/qrService";
import { toast } from "sonner";

/**
 * Single canonical Cafe QR — one premium card, no duplicate variants.
 * Table-ordering QR is kept as an opt-in advanced section (Settings toggle).
 */
function QRCanvas({ url, size = 280 }: { url: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) void QRCode.toCanvas(ref.current, url, { width: size, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" } });
  }, [url, size]);
  return <canvas ref={ref} className="mx-auto rounded-2xl" />;
}

export default function OwnerQR() {
  const { cafe, loading } = useOwnerCafe();
  const [tableNo, setTableNo] = useState("1");
  const [copied, setCopied] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [showTables, setShowTables] = useState(false);
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

  if (loading) return <OwnerLayout title="QR Code"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;
  const slug = cafe?.slug ?? "your-cafe";
  const url = qrUrl(slug, "main");
  const tableUrl = `${url}/table/${encodeURIComponent(tableNo || "1")}`;

  const fetchTables = async () => {
    if (!cafe?.id) return;
    
    setTableLoading(true);
    try {
      const tablesData = await TableManagementService.getTables(cafe.id);
      setTables(tablesData);
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("Failed to load tables");
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    if (cafe?.id && cafe?.table_ordering_enabled) {
      fetchTables();
    }
  }, [cafe?.id, cafe?.table_ordering_enabled]);

  const downloadPNG = async (u: string, label: string) => {
    const dataUrl = await QRCode.toDataURL(u, { width: 1024, margin: 2 });
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${slug}-${label}.png`; a.click();
    toast.success("PNG downloaded");
  };
  const printPoster = async (u: string, label: string) => {
    const dataUrl = await QRCode.toDataURL(u, { width: 720, margin: 2 });
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${cafe?.name ?? "Cafe"} — ${label}</title>
      <style>body{font-family:'Helvetica Neue',system-ui,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a;background:#faf7f2}h1{font-size:42px;margin-bottom:8px;letter-spacing:-.02em}h2{font-size:18px;color:#7a6f5f;margin-top:0;font-weight:500}img{margin:36px auto;display:block;max-width:380px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08)}p{color:#9a8e7d;font-size:11px;font-family:'SF Mono',monospace;word-break:break-all;margin-top:20px}.footer{margin-top:48px;font-size:13px;color:#7a6f5f;font-weight:500}</style></head>
      <body><h1>${cafe?.name ?? "Cafe"}</h1><h2>Scan to order, book & earn rewards</h2><img src="${dataUrl}" alt="QR"/><p>${u}</p><div class="footer">Powered by CafeBoost</div><script>window.print()</script></body></html>`);
  };
  const copyLink = async (u: string) => {
    await navigator.clipboard.writeText(u);
    setCopied(true); toast.success("Link copied to clipboard"); setTimeout(() => setCopied(false), 1500);
  };

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
    return `${qrUrl(slug, "main")}/table/${encodeURIComponent(table.table_number)}`;
  };

  const downloadTableQR = async (table: Table) => {
    const url = getTableQRUrl(table);
    const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${slug}-table-${table.table_number}-qr.png`;
    a.click();
    toast.success(`QR code for Table ${table.table_number} downloaded`);
  };

  const printTableQR = async (table: Table) => {
    const url = getTableQRUrl(table);
    const dataUrl = await QRCode.toDataURL(url, { width: 720, margin: 2 });
    const w = window.open("", "_blank");
    if (!w) return;
    
    w.document.write(`<html><head><title>${cafe?.name ?? "Cafe"} — Table ${table.table_number} QR</title>
      <style>body{font-family:'Helvetica Neue',system-ui,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a;background:#faf7f2}h1{font-size:42px;margin-bottom:8px;letter-spacing:-.02em}h2{font-size:18px;color:#7a6f5f;margin-top:0;font-weight:500}img{margin:36px auto;display:block;max-width:380px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08)}p{color:#9a8e7d;font-size:11px;font-family:'SF Mono',monospace;word-break:break-all;margin-top:20px}.footer{margin-top:48px;font-size:13px;color:#7a6f5f;font-weight:500}</style></head>
      <body><h1>${cafe?.name ?? "Cafe"}</h1><h2>Table ${table.table_number} • Scan to order</h2><img src="${dataUrl}" alt="QR"/><p>${url}</p><div class="footer">Powered by CafeBoost</div><script>window.print()</script></body></html>`);
  };

  const copyTableLink = async (table: Table) => {
    const url = getTableQRUrl(table);
    await navigator.clipboard.writeText(url);
    toast.success("Table link copied to clipboard");
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

  return (
    <OwnerLayout title="Cafe QR Code" subtitle="One premium QR — your customers' gateway to everything you offer.">
      <div className="max-w-xl mx-auto">
        <Card className="p-10 text-center bg-gradient-card border-border/60 shadow-elegant">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent-foreground text-[11px] font-semibold mb-5">
            <Sparkles className="w-3 h-3" /> Your single cafe QR
          </div>
          <div className="bg-background p-5 rounded-3xl inline-block shadow-soft">
            <QRCanvas url={url} />
          </div>
          <h3 className="font-display text-2xl font-bold mt-6">{cafe?.name ?? "Your Cafe"}</h3>
          <p className="text-sm text-muted-foreground mt-1.5">Menu · Book · Rewards · Orders — all in one scan</p>
          <p className="text-xs text-muted-foreground mt-4 font-mono break-all bg-muted/60 px-3 py-2 rounded-lg inline-block max-w-full">{qrPath(slug, "main")}</p>
          <div className="grid grid-cols-3 gap-2 mt-6">
            <Button variant="hero" size="sm" onClick={() => downloadPNG(url, "qr")}><Download className="w-3.5 h-3.5 mr-1" /> PNG</Button>
            <Button variant="outline" size="sm" onClick={() => printPoster(url, "Cafe QR")}><Printer className="w-3.5 h-3.5 mr-1" /> Poster</Button>
            <Button variant="outline" size="sm" onClick={() => copyLink(url)}>{copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />} {copied ? "Copied" : "Copy"}</Button>
          </div>
        </Card>

        {cafe?.table_ordering_enabled ? (
          <>
            <Card className="p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-base font-bold">Table-ordering QR</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Print one per table — orders arrive tagged.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Table #</label>
                  <input value={tableNo} onChange={e => setTableNo(e.target.value)} className="w-16 h-9 px-2 rounded-md border border-input text-sm text-center" />
                </div>
              </div>
              <div className="flex justify-center py-3"><QRCanvas url={tableUrl} size={160} /></div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => downloadPNG(tableUrl, `table-${tableNo}`)}><Download className="w-3.5 h-3.5 mr-1" /> PNG</Button>
                <Button variant="outline" size="sm" onClick={() => printPoster(tableUrl, `Table ${tableNo}`)}><Printer className="w-3.5 h-3.5 mr-1" /> Poster</Button>
                <Button variant="outline" size="sm" onClick={() => copyLink(tableUrl)}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
                <Button variant="hero" size="sm" className="w-full" onClick={() => setShowTables(!showTables)}>
                  <TableIcon className="w-3.5 h-3.5 mr-1" /> {showTables ? "Hide Tables" : "Manage Tables"}
                </Button>
              </div>
            </Card>

            {/* Table Management Section */}
            {showTables && (
              <Card className="p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display text-base font-bold">Table Management</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Manage all tables, generate QR codes, and update status.</p>
                  </div>
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
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => document.querySelector('[data-state="open"] button[aria-label="Close"]')?.click()}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateTable} disabled={isCreating || !newTable.tableNumber}>
                          {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Create Table
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {tableLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : tables.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <TableIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>No tables yet. Add your first table to start managing.</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {tables.map((table) => (
                        <Card key={table.id} className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge className={getStatusColor(table.status)}>
                                  {getStatusIcon(table.status)}
                                  <span className="ml-1">{table.status}</span>
                                </Badge>
                                <span className="font-bold text-lg">#{table.table_number}</span>
                              </div>
                              {table.table_name && (
                                <p className="text-sm font-medium mt-1">{table.table_name}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <Users className="w-3.5 h-3.5" />
                                <span>Capacity: {table.capacity}</span>
                                {table.location_description && (
                                  <>
                                    <MapPin className="w-3.5 h-3.5 ml-2" />
                                    <span>{table.location_description}</span>
                                  </>
                                )}
                              </div>
                              {table.notes && (
                                <p className="text-xs text-muted-foreground mt-2">{table.notes}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => downloadTableQR(table)}
                                title="Download QR"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => printTableQR(table)}
                                title="Print QR"
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyTableLink(table)}
                                title="Copy Link"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Button
                              size="sm"
                              variant={table.status === 'available' ? 'default' : 'outline'}
                              onClick={() => handleUpdateStatus(table.id, 'available')}
                            >
                              Available
                            </Button>
                            <Button
                              size="sm"
                              variant={table.status === 'occupied' ? 'default' : 'outline'}
                              onClick={() => handleUpdateStatus(table.id, 'occupied')}
                            >
                              Occupied
                            </Button>
                            <Button
                              size="sm"
                              variant={table.status === 'reserved' ? 'default' : 'outline'}
                              onClick={() => handleUpdateStatus(table.id, 'reserved')}
                            >
                              Reserved
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteTable(table.id)}
                              title="Delete table"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </>
        ) : (
          <Card className="p-6 mt-6">
            <div className="text-center">
              <TableIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-display text-base font-bold">Table ordering is disabled</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Enable table ordering in Settings to generate per-table QR codes.
              </p>
            </div>
          </Card>
        )}
      </div>
    </OwnerLayout>
  );
}
