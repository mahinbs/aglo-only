            {/* ═══ MY STRATEGY PANEL ═══ */}
            <div className="card my-strategy-panel">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(56,189,248,0.1)",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    &#x1F3AF;
                  </span>
                  My Strategies
                </div>
                <span className="card-badge badge-blue">
                  {myStrategies.length} Saved
                </span>
              </div>
              <div className="strategy-builder grid lg:grid-cols-[55%,1fr] items-start gap-7
              ">
                <div className="my-strategy-list-shell">
                  <div className="strategy-cards">
                    {myStrategies.map((s) => {
                      const lifecycle = normalizeLifecycleState(
                        s.lifecycle_state,
                        Boolean(s.deployed),
                      );
                      const isLive =
                        lifecycle === "ACTIVE" ||
                        lifecycle === "WAITING_MARKET_OPEN" ||
                        lifecycle === "TRIGGERED";
                      const strategyType = strategyKindTag(s);
                      const strategyTypeClass =
                        strategyType === "options"
                          ? "type-meanrev"
                          : "type-momentum";
                      return (
                        <div className="my-strat-card my-strat-card-flat" key={s.id}>
                          <div className="my-strat-flat-top">
                            <div className="my-strat-flat-title">
                              <span
                                className="my-strat-card-name"
                                style={{ fontSize: 14, whiteSpace: "nowrap" }}
                              >
                                {s.name}
                              </span>
                              <span
                                className={`my-strat-card-type ${strategyTypeClass}`}
                                style={{
                                  fontSize: 9,
                                  letterSpacing: 1.2,
                                  textTransform: "uppercase",
                                }}
                              >
                                {strategyType}
                              </span>
                            </div>
                            <span
                              className={`strategy-tag ${isLive ? "tag-active" : "tag-paused"}`}
                              style={{ fontSize: 10 }}
                            >
                              {isLive ? "LIVE" : "STOPPED"}
                            </span>
                          </div>

                          <div className="my-strat-flat-meta">
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>Broker </span>
                              <span style={{ color: "var(--accent-cyan)" }}>
                                {String(
                                  s.broker || summary?.broker || "Zerodha",
                                )}
                              </span>
                            </div>
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>SL </span>
                              <span style={{ color: "var(--accent-red)" }}>
                                {s.stopLoss || "1.7%"}
                              </span>
                            </div>
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>TP </span>
                              <span style={{ color: "var(--accent-green)" }}>
                                {s.takeProfit || "2.4%"}
                              </span>
                            </div>
                          </div>

                          <div className="my-strat-actions">
                            {pendingDelete?.id === s.id ? (
                              <>
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-delete"
                                  onClick={async () => {
                                    const isOptions =
                                      Boolean(s?.is_options) ||
                                      strategyKindTag(s) === "options";
                                    if (
                                      useChartmate &&
                                      (isOptions
                                        ? chartmateActions?.onDeleteOptionsStrategy
                                        : chartmateActions?.onDeleteStrategy)
                                    ) {
                                      const err = isOptions
                                        ? await chartmateActions.onDeleteOptionsStrategy(
                                            s.id,
                                          )
                                        : await chartmateActions.onDeleteStrategy(
                                            s.id,
                                            s.name,
                                          );
                                      if (err) {
                                        addLog("error", err);
                                        setPendingDelete(null);
                                        return;
                                      }
                                      chartmateActions.onRefresh?.();
                                      setPendingDelete(null);
                                      return;
                                    }
                                    setMyStrategies((prev) =>
                                      prev.filter((x) => x.id !== s.id),
                                    );
                                    addLog("warn", `Strategy "${s.name}" deleted`);
                                    setPendingDelete(null);
                                  }}
                                >
                                  Confirm delete
                                </button>
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-edit"
                                  onClick={() => setPendingDelete(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`strat-action-btn ${isLive ? "strat-btn-stop" : "strat-btn-deploy"}`}
                                  style={{
                                    borderRadius: 999,
                                    padding: "4px 10px",
                                    ...(!sessLive && !isLive
                                      ? { opacity: 0.6, cursor: "pointer" }
                                      : {}),
                                  }}
                                  title={
                                    isLive
                                      ? "Stop this live strategy"
                                      : !sessLive
                                        ? "Connect broker (live session) to activate"
                                        : "Deploy this strategy live"
                                  }
                                  onClick={() => {
                                    if (isLive) {
                                      setMyStrategies((prev) =>
                                        prev.map((x) =>
                                          x.id === s.id
                                            ? {
                                                ...x,
                                                deployed: false,
                                                lifecycle_state: "PAUSED",
                                              }
                                            : x,
                                        ),
                                      );
                                      addLog(
                                        "warn",
                                        `Strategy "${s.name}" stopped`,
                                      );
                                      return;
                                    }

                                    if (!sessLive) {
                                      toast.error(
                                        "Broker not connected — connect your broker (live session) before activating a strategy.",
                                        {
                                          description:
                                            "Click 'Connect broker' in the top navigation bar.",
                                        },
                                      );
                                      addLog(
                                        "warn",
                                        "Connect broker (live session) before activating a strategy.",
                                      );
                                      return;
                                    }
                                    const isOptions =
                                      Boolean(s?.is_options) ||
                                      strategyKindTag(s) === "options";
                                    if (isOptions) {
                                      setActivateOptionsTarget(s._raw ?? s);
                                      return;
                                    }
                                    setGoLiveTarget(s);
                                    setGoLiveForm(defaultsGoLiveFromCard(s));
                                    setGoLiveRememberSymbol(
                                      Boolean(
                                        s?.position_config &&
                                          typeof s.position_config === "object" &&
                                          s.position_config.activation_defaults &&
                                          typeof s.position_config
                                            .activation_defaults === "object" &&
                                          String(
                                            s.position_config.activation_defaults
                                              .symbol || "",
                                          ).trim(),
                                      ),
                                    );
                                  }}
                                >
                                  {isLive ? "Stop" : "Deploy"}
                                </button>
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-delete"
                                  style={{ borderRadius: 999, padding: "4px 10px" }}
                                  onClick={() =>
                                    setPendingDelete({ id: s.id, name: s.name })
                                  }
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="my-strat-quickstats">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 4,
                      color: "var(--text-primary)",
                    }}
                  >
                    Quick Stats
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginBottom: 10,
                    }}
                  >
                    Your strategy portfolio
                  </div>
                  <div className="my-strat-quickstats-grid">
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Total</span>
                      <span style={{ color: "var(--accent-cyan)" }}>
                        {myStrategies.length}
                      </span>
                    </div>
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Live</span>
                      <span style={{ color: "var(--accent-green)" }}>
                        {
                          myStrategies.filter((s) => {
                            const st = normalizeLifecycleState(
                              s.lifecycle_state,
                              Boolean(s.deployed),
                            );
                            return (
                              st === "ACTIVE" ||
                              st === "WAITING_MARKET_OPEN" ||
                              st === "TRIGGERED"
                            );
                          }).length
                        }
                      </span>
                    </div>
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Stopped</span>
                      <span style={{ color: "var(--accent-yellow)" }}>
                        {
                          myStrategies.filter((s) => {
                            const st = normalizeLifecycleState(
                              s.lifecycle_state,
                              Boolean(s.deployed),
                            );
                            return !(
                              st === "ACTIVE" ||
                              st === "WAITING_MARKET_OPEN" ||
                              st === "TRIGGERED"
                            );
                          }).length
                        }
                      </span>
                    </div>
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Brokers</span>
                      <span style={{ color: "var(--accent-purple)" }}>1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

