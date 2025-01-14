// Configuração da API DexScreener
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";
const TOKEN_ADDRESS =
  "0xbc732bc5f1e9a9f4bdf4c0672ee538dbf56c161afe04ff1de2176efabdf41f92::suai::SUAI";

async function fetchMarketData() {
  try {
    // Usando o endpoint correto para buscar dados do token
    const response = await fetch(`${DEXSCREENER_API}/${TOKEN_ADDRESS}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Raw API Response:", data); // Debug

    // Verificar se temos pares retornados
    if (!data.pairs || data.pairs.length === 0) {
      throw new Error("No pairs found for token");
    }

    // Pegar o primeiro par (mais relevante)
    const pair = data.pairs[0];

    // Verificar dados essenciais
    if (!pair.priceUsd || !pair.liquidity || !pair.volume || !pair.txns) {
      throw new Error("Missing essential pair data");
    }

    // Processar dados com verificações de null/undefined
    const processedData = {
      price: parseFloat(pair.priceUsd) || 0,
      priceChange: {
        h1: parseFloat(pair.priceChange?.h1) || 0,
        h24: parseFloat(pair.priceChange?.h24) || 0,
        h7d: parseFloat(pair.priceChange?.h7d) || 0,
      },
      volume: {
        h24: parseFloat(pair.volume?.h24) || 0,
        h6: parseFloat(pair.volume?.h6) || 0,
        h1: parseFloat(pair.volume?.h1) || 0,
      },
      liquidity: {
        usd: parseFloat(pair.liquidity?.usd) || 0,
        base: parseFloat(pair.liquidity?.base) || 0,
        quote: parseFloat(pair.liquidity?.quote) || 0,
      },
      transactions: {
        h24: {
          buys: parseInt(pair.txns?.h24?.buys) || 0,
          sells: parseInt(pair.txns?.h24?.sells) || 0,
        },
        h6: {
          buys: parseInt(pair.txns?.h6?.buys) || 0,
          sells: parseInt(pair.txns?.h6?.sells) || 0,
        },
        h1: {
          buys: parseInt(pair.txns?.h1?.buys) || 0,
          sells: parseInt(pair.txns?.h1?.sells) || 0,
        },
      },
      pairInfo: {
        dexId: pair.dexId,
        url: pair.url,
        pairAddress: pair.pairAddress,
        baseToken: {
          name: pair.baseToken?.name,
          symbol: pair.baseToken?.symbol,
          address: pair.baseToken?.address,
        },
        quoteToken: {
          name: pair.quoteToken?.name,
          symbol: pair.quoteToken?.symbol,
          address: pair.quoteToken?.address,
        },
      },
    };

    // Calcular métricas
    const metrics = calculateMetrics(processedData);

    // Debug dos dados processados
    console.log("Processed Data:", processedData);
    console.log("Calculated Metrics:", metrics);

    // Atualizar interface
    updateInterface({
      ...processedData,
      metrics,
    });
  } catch (error) {
    console.error("Error fetching market data:", error);
    handleError();
  }
}

// Melhorar o cálculo de métricas
function calculateMetrics(data) {
  // Evitar divisão por zero
  const h24Total =
    data.transactions.h24.buys + data.transactions.h24.sells || 1;
  const buyPressure = (data.transactions.h24.buys / h24Total) * 100;
  const sellPressure = (data.transactions.h24.sells / h24Total) * 100;

  // Calcular tendência de volume com proteção contra divisão por zero
  const avgHourlyVolume = data.volume.h24 / 24 || 1;
  const volumeTrend = (data.volume.h1 / avgHourlyVolume) * 100;

  // Calcular força da tendência
  const trendStrength = Math.abs(data.priceChange.h24);

  return {
    buyPressure,
    sellPressure,
    volumeTrend,
    trendStrength,
    priceChange: data.priceChange,
    sentiment: calculateSentiment(data),
  };
}

function calculateSentiment(data) {
  let score = 50; // Neutro

  // Peso do preço (40%)
  score += data.priceChange.h24 * 2 * 0.4;

  // Peso do volume (30%)
  const volumeChange = (data.volume.h1 / (data.volume.h24 / 24) - 1) * 100;
  score += volumeChange * 0.5 * 0.3;

  // Peso da pressão de compra/venda (30%)
  const h24Total = data.transactions.h24.buys + data.transactions.h24.sells;
  const buyPressure = (data.transactions.h24.buys / h24Total) * 100;
  score += (buyPressure - 50) * 0.3;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

// Processar transações do SuiScan
function processSuiscanTransactions(transactions) {
  const last24h = transactions.filter((tx) => {
    const txTime = new Date(tx.timestamp).getTime();
    const now = Date.now();
    return now - txTime <= 24 * 60 * 60 * 1000;
  });

  const buys = last24h.filter((tx) => tx.type === "swap" && tx.is_buy).length;
  const sells = last24h.filter((tx) => tx.type === "swap" && !tx.is_buy).length;

  return {
    recent: transactions.slice(0, 10).map((tx) => ({
      type: tx.is_buy ? "buy" : "sell",
      amount: tx.amount_usd,
      price: tx.price_usd,
      timestamp: tx.timestamp,
      hash: tx.transaction_hash,
    })),
    pressure: {
      buys,
      sells,
      total: buys + sells,
    },
  };
}

// Atualizar interface com os novos dados
function updateInterface(data) {
  try {
    // Verificar se temos dados válidos antes de atualizar
    if (!data || !data.price) {
      throw new Error("Invalid data for interface update");
    }

    // Atualizar elementos com verificação de existência
    const priceElement = document.querySelector(".current-price");
    if (priceElement) {
      priceElement.textContent = `$${data.price.toFixed(6)}`;
    }

    // Variações de preço
    const priceChangeElement = document.querySelector(".price-change");
    if (priceChangeElement) {
      priceChangeElement.textContent = `${
        data.priceChange.h24 > 0 ? "+" : ""
      }${data.priceChange.h24.toFixed(2)}%`;
      priceChangeElement.className = `price-change ${
        data.priceChange.h24 > 0 ? "positive" : "negative"
      }`;
    }

    // Liquidez
    const liquidityElement = document.querySelector(".liquidity-value");
    if (liquidityElement) {
      liquidityElement.textContent = `$${formatNumber(data.liquidity.usd)}`;
    }

    // Volume 24h
    const volumeElement = document.querySelector(".volume-value");
    if (volumeElement) {
      volumeElement.textContent = `$${formatNumber(data.volume.h24)}`;
    }

    // Total de transações
    const txCountElement = document.querySelector(".tx-count");
    if (txCountElement && data.transactions?.h24) {
      const totalTx = data.transactions.h24.buys + data.transactions.h24.sells;
      txCountElement.textContent = formatNumber(totalTx);
    }

    // Atualizar métricas e sentimento
    if (data.metrics) {
      updateMetrics(data.metrics);
    }

    // Adicionar animação de atualização
    document
      .querySelectorAll(".performance-card, .activity-card")
      .forEach((card) => {
        addUpdateAnimation(card);
      });

    // Atualizar pressão de mercado
    if (data.transactions?.h24) {
      const total =
        data.transactions.h24.buys + data.transactions.h24.sells || 1;
      const buyPressure = (data.transactions.h24.buys / total) * 100;
      const sellPressure = (data.transactions.h24.sells / total) * 100;

      // Atualizar barras de pressão
      updatePressureMeter(
        ".buys .meter-fill",
        ".buys .pressure-value",
        buyPressure,
        data.transactions.h24.buys,
        "Buy"
      );
      updatePressureMeter(
        ".sells .meter-fill",
        ".sells .pressure-value",
        sellPressure,
        data.transactions.h24.sells,
        "Sell"
      );
    }

    // Atualizar sinais de trading
    updateTradingSignals(data);
  } catch (error) {
    console.error("Error updating interface:", error);
    handleError();
  }
}

// Atualizar pressão de mercado com verificações corretas
function updateMarketPressure(data) {
  try {
    if (!data || !data.transactions?.h24) {
      throw new Error("Invalid market pressure data");
    }

    const buyMeter = document.querySelector(".buys .meter-fill");
    const buyValue = document.querySelector(".buys .pressure-value");
    const sellMeter = document.querySelector(".sells .meter-fill");
    const sellValue = document.querySelector(".sells .pressure-value");

    // Calcular pressões
    const total = data.transactions.h24.buys + data.transactions.h24.sells || 1;
    const buyPressure = (data.transactions.h24.buys / total) * 100;
    const sellPressure = (data.transactions.h24.sells / total) * 100;

    if (buyMeter && buyValue) {
      buyMeter.style.width = `${buyPressure}%`;
      buyValue.innerHTML = `
				<span class="pressure-percentage">${buyPressure.toFixed(1)}%</span>
				<span class="pressure-details">${formatNumber(
          data.transactions.h24.buys
        )} Buys</span>
			`;
    }

    if (sellMeter && sellValue) {
      sellMeter.style.width = `${sellPressure}%`;
      sellValue.innerHTML = `
				<span class="pressure-percentage">${sellPressure.toFixed(1)}%</span>
				<span class="pressure-details">${formatNumber(
          data.transactions.h24.sells
        )} Sells</span>
			`;
    }
  } catch (error) {
    console.error("Error updating market pressure:", error);
  }
}

// Atualizar métricas com verificações mais robustas
function updateMetrics(metrics) {
  try {
    if (!metrics) {
      throw new Error("No metrics data provided");
    }

    // Atualizar força da tendência
    const trendStrengthElement = document.querySelector(
      ".trend-strength .meter-fill"
    );
    const trendValue = document.querySelector(".trend-value");

    if (trendStrengthElement && trendValue) {
      const trendStrength = Math.min(metrics.trendStrength * 2, 100) || 0;
      trendStrengthElement.style.width = `${trendStrength}%`;
      trendValue.textContent = `${trendStrength.toFixed(1)}%`;
    }

    // Atualizar direção da tendência
    const trendDirection = document.querySelector(".trend-direction");
    if (trendDirection && metrics.priceChange) {
      const directionText =
        metrics.priceChange.h24 > 0 ? "Uptrend" : "Downtrend";
      const directionClass =
        metrics.priceChange.h24 > 0 ? "positive" : "negative";
      trendDirection.innerHTML = `<span class="value ${directionClass}">${directionText}</span>`;
    }

    // Atualizar Volume RSI apenas se houver dados de volume
    if (
      metrics.volume &&
      metrics.volume.h1 !== undefined &&
      metrics.volume.h24 !== undefined
    ) {
      const volumeRSI = calculateVolumeRSI(metrics);
      const volumeRSIElement = document.querySelector(".volume-rsi-value");
      const volumeRSIStatus =
        volumeRSIElement?.parentElement?.querySelector(".indicator-status");

      if (volumeRSIElement && volumeRSI) {
        volumeRSIElement.textContent = volumeRSI.value.toFixed(2);
        volumeRSIElement.className = `volume-rsi-value ${getVolumeStatusClass(
          volumeRSI.value
        )}`;
      }

      if (volumeRSIStatus && volumeRSI) {
        volumeRSIStatus.textContent = volumeRSI.status;
      }
    }

    // Atualizar pressão de mercado apenas se houver dados de transações
    if (metrics.transactions && metrics.transactions.h24) {
      updateMarketPressure(metrics);
    }
  } catch (error) {
    console.error("Error updating metrics:", error);
  }
}

// Função para avaliar o risco
function updateRiskAssessment(metrics) {
  const riskValue = document.querySelector(".risk-value");
  const riskStatus = document.querySelector(".risk-status .value");

  // Calcular nível de risco baseado em múltiplos fatores
  let riskScore = 0;

  // Volatilidade do preço (40%)
  riskScore += Math.min(Math.abs(metrics.priceChange.h24) * 2, 40);

  // Volume anormal (30%)
  const volumeDeviation = Math.abs(metrics.volumeTrend - 100);
  riskScore += Math.min(volumeDeviation, 30);

  // Pressão de venda (30%)
  riskScore += Math.min(metrics.sellPressure / 2, 30);

  // Atualizar elementos
  riskValue.textContent = `${Math.round(riskScore)}%`;

  let riskLevel;
  if (riskScore < 30) riskLevel = "Low";
  else if (riskScore < 60) riskLevel = "Medium";
  else riskLevel = "High";

  riskStatus.textContent = riskLevel;
  riskStatus.className = `value ${getRiskClass(riskLevel)}`;
}

// Função auxiliar para classe de sentimento
function getSentimentClass(sentiment) {
  if (sentiment >= 70) return "very-positive";
  if (sentiment >= 60) return "positive";
  if (sentiment <= 30) return "very-negative";
  if (sentiment <= 40) return "negative";
  return "neutral";
}

// Função auxiliar para classe de risco
function getRiskClass(riskLevel) {
  switch (riskLevel) {
    case "Low":
      return "positive";
    case "Medium":
      return "neutral";
    case "High":
      return "negative";
    default:
      return "neutral";
  }
}

// Atualizar sinal de trading com mais detalhes
function updateTradingSignal(metrics) {
  const signalElement = document.querySelector(".signal-value");
  let signal = "Hold";
  let className = "neutral";

  // Lógica mais detalhada para sinais
  if (metrics.sentiment >= 70 && metrics.volumeTrend > 120) {
    signal = "Strong Buy";
    className = "very-positive";
  } else if (metrics.sentiment >= 60 && metrics.volumeTrend > 100) {
    signal = "Buy";
    className = "positive";
  } else if (metrics.sentiment <= 30 && metrics.volumeTrend < 80) {
    signal = "Strong Sell";
    className = "very-negative";
  } else if (metrics.sentiment <= 40 && metrics.volumeTrend < 100) {
    signal = "Sell";
    className = "negative";
  }

  signalElement.textContent = signal;
  signalElement.className = `signal-value ${className}`;
}

// Atualizar medidor de pressão
function updatePressureMeter(
  meterSelector,
  valueSelector,
  pressure,
  count,
  type
) {
  const meter = document.querySelector(meterSelector);
  const valueContainer = document.querySelector(valueSelector);

  if (meter && valueContainer) {
    // Atualizar barra
    meter.style.width = `${pressure}%`;

    // Atualizar texto com porcentagem e contagem
    valueContainer.innerHTML = `
			<div class="pressure-details">
				<span class="pressure-count">${formatNumber(count)} ${type}s</span>
				<span class="pressure-percentage">${pressure.toFixed(1)}%</span>
			</div>
		`;
  }
}

// Funções auxiliares
function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) {
    return "0.00";
  }
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

// Iniciar com melhor gestão de estado
let updateInterval;

async function startUpdates() {
  try {
    // Limpar intervalo existente se houver
    if (updateInterval) {
      clearInterval(updateInterval);
    }

    // Primeira chamada
    await fetchMarketData();
    console.log("Initial data fetch successful");

    // Configurar intervalo para atualizações
    updateInterval = setInterval(async () => {
      try {
        await fetchMarketData();
      } catch (error) {
        console.error("Error in update interval:", error);
        handleError();
      }
    }, 15000); // 15 segundos
  } catch (error) {
    console.error("Error starting updates:", error);
    handleError();
  }
}

// Iniciar quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", startUpdates);

// Adicionar animação de atualização
function addUpdateAnimation(element) {
  element.classList.add("updating");
  setTimeout(() => element.classList.remove("updating"), 1000);
}

// Tratar erros
function handleError() {
  const errorElements = document.querySelectorAll(
    ".current-price, .price-change, .indicator-value, .trend-value, .signal-value, .pressure-value"
  );

  errorElements.forEach((el) => {
    if (el) {
      el.textContent = "Error loading data";
      el.classList.add("error");
    }
  });

  // Tentar reconectar após erro
  setTimeout(() => {
    console.log("Attempting to reconnect...");
    fetchMarketData();
  }, 5000);
}

// Função auxiliar para verificar elementos
function updateElementIfExists(selector, value, className = null) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
    if (className) {
      element.className = className;
    }
  }
}

// Calcular Volume RSI com melhor tratamento de erros
function calculateVolumeRSI(data) {
  try {
    if (!data?.volume?.h1 || !data?.volume?.h24) {
      throw new Error("Missing volume data for RSI calculation");
    }

    const currentVolume = data.volume.h1;
    const previousVolume = data.volume.h24 / 24;

    // Evitar cálculos com valores inválidos
    if (isNaN(currentVolume) || isNaN(previousVolume)) {
      throw new Error("Invalid volume values");
    }

    let gains = 0;
    let losses = 0;

    if (currentVolume > previousVolume) {
      gains = currentVolume - previousVolume;
    } else {
      losses = previousVolume - currentVolume;
    }

    // Evitar divisão por zero
    const RS = gains / (losses || 1);
    const RSI = 100 - 100 / (1 + RS);

    return {
      value: Math.min(Math.max(RSI, 0), 100), // Garantir valor entre 0 e 100
      status: getVolumeRSIStatus(RSI),
    };
  } catch (error) {
    console.error("Error calculating Volume RSI:", error);
    return {
      value: 50, // Valor neutro em caso de erro
      status: "Error calculating RSI",
    };
  }
}

// Determinar status do Volume RSI
function getVolumeRSIStatus(rsi) {
  if (rsi >= 70) return "High Volume";
  if (rsi <= 30) return "Low Volume";
  return "Normal Volume";
}

// Função auxiliar para classe do status do volume
function getVolumeStatusClass(rsi) {
  if (rsi >= 70) return "very-positive";
  if (rsi <= 30) return "very-negative";
  return "neutral";
}

// Atualizar sinais de trading
function updateTradingSignals(data) {
  try {
    // Atualizar sinal principal
    const signalElement = document.querySelector(".signal-value");
    if (signalElement) {
      const signal = calculateTradingSignal(data);
      signalElement.textContent = signal.text;
      signalElement.className = `signal-value ${signal.class}`;
    }

    // Atualizar sentimento
    const sentimentElement = document.querySelector(".sentiment-value");
    if (sentimentElement) {
      const sentiment = calculateSentiment(data);
      sentimentElement.textContent = `${sentiment}%`;
      sentimentElement.className = `sentiment-value ${getSentimentClass(
        sentiment
      )}`;
    }

    // Atualizar tendência de volume
    const volumeTrendElement = document.querySelector(".volume-trend-value");
    if (volumeTrendElement) {
      const volumeTrend = calculateVolumeTrend(data);
      const trendValue = volumeTrend > 100 ? "+" : "";
      volumeTrendElement.textContent = `${trendValue}${(
        volumeTrend - 100
      ).toFixed(1)}%`;
      volumeTrendElement.className = `volume-trend-value ${
        volumeTrend > 100 ? "positive" : "negative"
      }`;
    }
  } catch (error) {
    console.error("Error updating trading signals:", error);
  }
}

// Calcular sinal de trading
function calculateTradingSignal(data) {
  const sentiment = calculateSentiment(data);
  const volumeTrend = calculateVolumeTrend(data);

  if (sentiment >= 70 && volumeTrend > 120) {
    return { text: "Strong Buy", class: "very-positive" };
  } else if (sentiment >= 60 && volumeTrend > 100) {
    return { text: "Buy", class: "positive" };
  } else if (sentiment <= 30 && volumeTrend < 80) {
    return { text: "Strong Sell", class: "very-negative" };
  } else if (sentiment <= 40 && volumeTrend < 100) {
    return { text: "Sell", class: "negative" };
  }
  return { text: "Hold", class: "neutral" };
}

// Calcular tendência de volume
function calculateVolumeTrend(data) {
  const avgHourlyVolume = data.volume.h24 / 24 || 1;
  return (data.volume.h1 / avgHourlyVolume) * 100;
}

// Função para copiar o endereço do contrato
function copyContract() {
  const contractAddress =
    "0x8385d4324b63ef5935f076b9cae6e0fe1b7353699b08fc6d33e2b1544cff5471::aira::AIRA";
  navigator.clipboard.writeText(contractAddress).then(() => {
    const copyBtn = document.querySelector(".copy-btn");
    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    }, 2000);
  });
}

// Intersection Observer para animações do roadmap
document.addEventListener("DOMContentLoaded", function () {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    {
      threshold: 0.1,
    }
  );

  // Observar todos os itens do roadmap
  document.querySelectorAll(".roadmap-item").forEach((item) => {
    observer.observe(item);
  });
});

// Função para adicionar efeito de partículas nos itens ativos
function createParticles(element) {
  const particle = document.createElement("span");
  particle.className = "particle";

  const size = Math.random() * 3 + 1;
  const destinationX = (Math.random() - 0.5) * 100;
  const destinationY = (Math.random() - 0.5) * 100;

  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;

  element.appendChild(particle);

  const animation = particle.animate(
    [
      {
        transform: "translate(0, 0)",
        opacity: 1,
      },
      {
        transform: `translate(${destinationX}px, ${destinationY}px)`,
        opacity: 0,
      },
    ],
    {
      duration: 1000,
      easing: "cubic-bezier(0, .9, .57, 1)",
      delay: Math.random() * 200,
    }
  );

  animation.onfinish = () => {
    particle.remove();
  };
}

// Adicionar partículas aos itens ativos
setInterval(() => {
  document.querySelectorAll(".roadmap-item.active").forEach((item) => {
    createParticles(item);
  });
}, 300);
