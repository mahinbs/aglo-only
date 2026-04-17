import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tradingsmartalgo-shell.css";
import "../../chartmate-trading-widget/src/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
