"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      icons={{ success: null, error: null, info: null, warning: null }}
      toastOptions={{
        classNames: {
          toast:
            "font-sans !bg-background !text-foreground !border-border !rounded-xl !shadow-lg !gap-3",
          title: "!font-semibold !text-foreground",
          description: "!text-muted-foreground",
          actionButton:
            "!bg-foreground !text-background !rounded-md !px-3 !py-1.5 !font-medium",
          cancelButton: "!bg-muted !text-muted-foreground !rounded-md",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
