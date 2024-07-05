<style scoped>
.calibration-plot {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  overflow: hidden;
}

.canvas-wrapper {
  width: 100%;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 20px;
  border-radius: 8px;
}

canvas {
  width: 100%;
  background: transparent;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 8px;
}

.input-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-row .v-text-field,
.input-row .v-file-input {
  width: 100%;
  padding: 0 8px;
}

.coefficient-alert {
  width: 100%;
  display: flex;
  align-items: center;
}

.underlined-link {
  text-decoration: underline;
}
</style>

<template>
  <div class="calibration-plot">
    <v-alert v-if="containsInvalidValues" type="warning" text>
      JSON contains invalid values with probeValue set to 999999.
    </v-alert>

    <div class="canvas-wrapper">
      <div class="input-row">
        <v-file-input
          label="Upload Calibration JSON"
          @change="onFileChange"
          accept=".json"
          outlined
        />
        <v-text-field
          label="Base Temp for Best Fit Curve (°C)"
          v-model="calibrationTemp"
          type="number"
          @input="computeTemperatureCoefficients"
          outlined
          persistent-placeholder
        />
      </div>
      <v-alert v-if="jsonLoaded" class="coefficient-alert" type="info" text>
        Suggested Coefficients: A = {{ coefficients.A.toFixed(4) }}, B =
        {{ coefficients.B.toFixed(4) }}
        <br />
        Read
        <a
          ref="https://docs.duet3d.com/User_manual/Reference/Gcodes/G31"
          target="_blank"
          class="underlined-link"
        >
          Duet Documentation</a
        >
        on how to set temperature coefficients to the probe in <code>G31</code>.
      </v-alert>
      <canvas ref="scatterChart"></canvas>
    </div>
  </div>
</template>

<script>
import { Chart } from "chart.js";

export default {
  data() {
    return {
      scatterChart: null,
      calibrationTemp: 25,
      probeData: {
        scanCoefficients: { probeValueDelta: null, A: null, B: null, C: null },
        probeThreshold: null,
        triggerHeight: null,
      },
      chartData: {
        datasets: [
          {
            label: "Probe Temp vs. Computed Height",
            data: [],
            backgroundColor: "rgba(255, 0, 0, 0.5)", // Changed to red
            borderColor: "rgba(255, 0, 0, 1)", // Changed to red
            type: "line",
            fill: false,
          },
          {
            label: "Best Fit Curve",
            data: [],
            borderColor: "rgba(54, 162, 235, 1)",
            backgroundColor: "rgba(54, 162, 235, 0.5)",
            type: "line",
            fill: false,
          },
        ],
      },
      containsInvalidValues: false,
      jsonLoaded: false,
      coefficients: { A: null, B: null },
    };
  },
  watch: {
    calibrationTemp: "computeTemperatureCoefficients",
  },
  mounted() {
    this.initChart();
  },
  methods: {
    initChart() {
      const ctx = this.$refs.scatterChart.getContext("2d");
      this.scatterChart = new Chart(ctx, {
        type: "scatter",
        data: this.chartData,
        options: {
          responsive: true,
          scales: {
            x: {
              type: "linear",
              position: "bottom",
              title: {
                display: true,
                text: "Probe Temp (°C)",
              },
            },
            y: {
              title: {
                display: true,
                text: "Height",
              },
            },
          },
        },
      });
    },
    onFileChange(file) {
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const jsonContent = event.target.result;
          this.resetData();
          this.parseJsonData(jsonContent);
          this.computeTemperatureCoefficients();
          this.jsonLoaded = true;
        };
        reader.readAsText(file);
      }
    },
    resetData() {
      this.resetProbeData();
      this.chartData.datasets[0].data = [];
      this.chartData.datasets[1].data = [];
      this.containsInvalidValues = false;
      this.jsonLoaded = false;
      this.calibrationTemp = 25;
    },
    resetProbeData() {
      const nullScanCoefficients = {
        probeValueDelta: null,
        A: null,
        B: null,
        C: null,
      };
      this.probeData = {
        scanCoefficients: nullScanCoefficients,
        probeThreshold: null,
        triggerHeight: null,
      };
    },
    parseJsonData(jsonContent) {
      try {
        const jsonData = JSON.parse(jsonContent);
        this.readProbeSettings(jsonData);
        this.readProbeData(jsonData);

        this.updateScatterChart();
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    },
    computeHeight(probeValue) {
      const triggerHeight = this.probeData.triggerHeight;
      const probeDelta = probeValue - this.probeData.probeThreshold;
      const scanCoefficients = this.probeData.scanCoefficients;
      return (
        triggerHeight +
        scanCoefficients.A * probeDelta +
        scanCoefficients.B * probeDelta ** 2 +
        scanCoefficients.C * probeDelta ** 3
      );
    },
    computeBestFitCurve(data, xDelta = 0) {
      const n = data.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;

      data.forEach((dataPoint) => {
        const x = dataPoint.x - xDelta;
        sumX += x;
        sumY += dataPoint.y;
        sumXY += x * dataPoint.y;
        sumXX += x * x;
      });

      const A = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const B = (sumY - A * sumX) / n;

      return [A, B];
    },
    readProbeData(jsonData) {
      const validData = [];
      const probeTemps = [];

      this.containsInvalidValues = false;

      jsonData.calibrationValues.forEach((dataPoint) => {
        const [bedTemp, probeTemp, probeValue] = dataPoint;

        if (probeValue === 999999) {
          this.containsInvalidValues = true;
        } else {
          const height = this.computeHeight(probeValue);
          validData.push({ x: probeTemp, y: height });
          probeTemps.push(probeTemp);
        }
      });

      this.chartData.datasets[0].data = validData;
      this.calibrationTemp = Math.min(...probeTemps);
    },
    readProbeSettings(jsonData) {
      this.probeData.scanCoefficients = jsonData.scanCoefficients;
      this.probeData.probeThreshold = jsonData.probeThreshold;
      this.probeData.triggerHeight = jsonData.triggerHeight;
    },
    computeTemperatureCoefficients() {
      const data = this.chartData.datasets[0].data;
      const calibrationTemp = this.calibrationTemp;

      const [A, B] = this.computeBestFitCurve(data, calibrationTemp);

      this.coefficients.A = A;
      this.coefficients.B = B;

      const bestFitData = data.map((dataPoint) => {
        const deltaTemp = dataPoint.x - calibrationTemp;
        const bestFitHeight =
          this.probeData.triggerHeight + A * deltaTemp + B * deltaTemp ** 2;
        return { x: dataPoint.x, y: bestFitHeight };
      });

      this.chartData.datasets[1].data = bestFitData;

      this.updateScatterChart();
    },
    updateScatterChart() {
      if (this.scatterChart) {
        this.scatterChart.update();
      }
    },
  },
};
</script>
