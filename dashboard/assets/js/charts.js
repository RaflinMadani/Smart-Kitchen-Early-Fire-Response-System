// ================================================================
// charts.js — Chart.js wrapper untuk grafik sensor
// Chart.js dimuat via <script> tag (assets/vendor/chart.umd.min.js)
// ================================================================
import { chartHistory } from './state.js';
import { AMBANG_ASAP, CHART_MAX_POINTS } from './config.js';

let chart = null;

/** Buat instance Chart.js pada canvas #sensor-chart */
export function initChart() {
  const canvas = document.getElementById('sensor-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Dataset ambang asap: garis konstan putus-putus
  const thresholdData = Array(CHART_MAX_POINTS).fill(AMBANG_ASAP);

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'MQ-2 ADC',
          data: [],
          borderColor: 'rgb(251, 146, 60)',    // orange
          backgroundColor: 'rgba(251,146,60,0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          yAxisID: 'yLeft',
        },
        {
          label: `Ambang Asap (${AMBANG_ASAP})`,
          data: thresholdData,
          borderColor: 'rgb(250, 204, 21)',     // yellow
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          yAxisID: 'yLeft',
        },
        {
          label: 'Suhu (°C)',
          data: [],
          borderColor: 'rgb(96, 165, 250)',     // blue
          backgroundColor: 'rgba(96,165,250,0.05)',
          tension: 0.3,
          fill: false,
          pointRadius: 2,
          yAxisID: 'yRight',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#9ca3af', font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#f3f4f6',
          bodyColor: '#d1d5db',
        },
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', font: { size: 10 }, maxTicksLimit: 12 },
          grid:  { color: 'rgba(255,255,255,0.05)' },
        },
        yLeft: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 4095,
          title: { display: true, text: 'ADC (MQ-2)', color: '#fb923c', font: { size: 10 } },
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid:  { color: 'rgba(255,255,255,0.05)' },
        },
        yRight: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 80,
          title: { display: true, text: 'Suhu (°C)', color: '#60a5fa', font: { size: 10 } },
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid:  { drawOnChartArea: false },
        },
      },
    },
  });
}

/** Perbarui grafik dari chartHistory */
export function updateChart() {
  if (!chart) return;
  chart.data.labels              = [...chartHistory.labels];
  chart.data.datasets[0].data   = [...chartHistory.mq2];
  // threshold line selalu CHART_MAX_POINTS panjang
  chart.data.datasets[1].data   = Array(chartHistory.labels.length).fill(AMBANG_ASAP);
  chart.data.datasets[2].data   = [...chartHistory.suhu];
  chart.update('none'); // tanpa animasi untuk update cepat
}
