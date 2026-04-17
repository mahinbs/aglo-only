import React, { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol?: string;
  interval?: string;
}

function TradingViewWidget({ symbol = "NASDAQ:AAPL", interval = "D" }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current) {
      // Clear previous widget
      container.current.innerHTML = '';
      
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        "allow_symbol_change": true,
        "calendar": false,
        "details": false,
        "hide_side_toolbar": true,
        "hide_top_toolbar": false,
        "hide_legend": false,
        "hide_volume": false,
        "hotlist": false,
        "interval": interval,
        "locale": "en",
        "save_image": true,
        "style": "1",
        "symbol": symbol,
        "theme": "dark",
        "timezone": "Etc/UTC",
        "backgroundColor": "#0F0F0F",
        "gridColor": "rgba(242, 242, 242, 0.06)",
        "watchlist": [],
        "withdateranges": false,
        "compareSymbols": [],
        "studies": [],
        "autosize": true,
        "no_referral_id": true,
        "container_id": `tv_chart_${Date.now()}`,
      });
      container.current.appendChild(script);
    }
  }, [symbol, interval]);

  return (
    <div className="tradingview-widget-container h-full w-full relative" ref={container}>
      <div className="tradingview-widget-container__widget h-full w-full"></div>
      <div className="tradingview-widget-copyright absolute bottom-0 right-0 p-2">
        <a 
          href={`https://www.tradingview.com/symbols/${symbol}/?exchange=${symbol.split(':')[0]}`} 
          rel="noopener nofollow" 
          target="_blank"
          className="text-primary hover:text-primary/80 text-xs"
        >
          {symbol.split(':')[1] || symbol} chart by TradingView
        </a>
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);