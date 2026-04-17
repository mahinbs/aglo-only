import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link2, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface BrandedLinkBoardProps {
  slug: string;
  brandName: string;
  brandColor: string;
}

export function BrandedLinkBoard({ slug, brandName, brandColor }: BrandedLinkBoardProps) {
  const [copied, setCopied] = useState(false);
  const loginLink = `${window.location.origin}/wl/${slug}`;

  const copyLoginLink = () => {
    navigator.clipboard.writeText(loginLink);
    setCopied(true);
    toast.success("Login link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="glass-panel border-white/10 bg-white/5 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Link2 className="h-4 w-4" style={{ color: brandColor }} />
          Your Branded Login Link
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Share this link with your users. They'll see your brand when they sign in.</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-black/20">
          <code className="text-xs flex-1 break-all font-mono text-cyan-300">{loginLink}</code>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 h-8 border-white/10 hover:bg-white/5 text-xs" onClick={copyLoginLink}>
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
