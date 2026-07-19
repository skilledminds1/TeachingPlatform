"use client";

import { Button } from "@/components/ui/button";

export function CertificatePrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Download / Print PDF
    </Button>
  );
}
