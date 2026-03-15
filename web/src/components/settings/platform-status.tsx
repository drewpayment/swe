"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2 } from "lucide-react";
import { checkServiceHealth } from "@/lib/api";

const SERVICES = ["SWE API", "PostgreSQL", "Temporal Server", "LiteLLM Proxy", "Redis"];

export function PlatformStatusSection() {
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, string>>({});
  const [checkingStatus, setCheckingStatus] = useState(false);

  async function handleRefreshStatus() {
    setCheckingStatus(true);
    const res = await checkServiceHealth();
    if (res.success && res.data) {
      setServiceStatuses(res.data);
    } else {
      setServiceStatuses({ "SWE API": "offline" });
    }
    setCheckingStatus(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Status</CardTitle>
        <CardDescription>Service connectivity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {SERVICES.map((service) => {
            const status = serviceStatuses[service];
            return (
              <div key={service} className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">{service}</span>
                <Badge variant={status === "healthy" ? "success" : status === "unhealthy" ? "error" : "default"}>
                  {status ?? "unknown"}
                </Badge>
              </div>
            );
          })}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={handleRefreshStatus}
          disabled={checkingStatus}
        >
          {checkingStatus ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Refresh Status
        </Button>
      </CardContent>
    </Card>
  );
}
