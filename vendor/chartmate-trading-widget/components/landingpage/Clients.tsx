import React from 'react';

const Clients = () => {
    const markets = [
        "BINANCE", "COINBASE", "NASDAQ", "NYSE", "FOREX.COM", "KRAKEN"
    ];

    return (
        <section className="py-12 border-b border-gray-100 bg-white">
            <div className="container">
                <p className="text-center text-gray-400 text-sm font-semibold uppercase tracking-wider mb-8">
                    Compatible with Major Markets & Exchanges
                </p>
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
                    {markets.map((market, index) => (
                        <div key={index} className="text-xl font-bold text-gray-400 hover:text-primary transition-colors cursor-default">
                            {market}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Clients;
