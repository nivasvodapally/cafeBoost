import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentDialog } from "./PaymentDialog";

type Props = {
  orderId: string;
  cafeId: string;
  cafeName?: string;
  customerName?: string;
  customerPhone?: string | null;
  amount: number;
  onPaid?: () => void;
  size?: "sm" | "default" | "lg";
  variant?: "hero" | "outline" | "default";
  runnerMode?: boolean;
  label?: string;
};

/** Thin trigger button → PaymentDialog. Backwards-compatible wrapper. */
export function PayWithUpiButton({ orderId, cafeId, cafeName, customerName, customerPhone, amount, onPaid, size = "default", variant = "hero", runnerMode, label }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} className="gap-2">
        <Smartphone className="w-4 h-4" />
        {label ?? `Pay ₹${amount.toFixed(2)}`}
      </Button>
      <PaymentDialog
        open={open}
        onOpenChange={setOpen}
        orderId={orderId}
        cafeId={cafeId}
        cafeName={cafeName}
        amount={amount}
        customerName={customerName}
        customerPhone={customerPhone}
        runnerMode={runnerMode}
        onPaid={onPaid}
      />
    </>
  );
}
