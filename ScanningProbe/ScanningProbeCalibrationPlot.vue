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
      <v-alert
        v-if="jsonLoaded"
        border="left"
        class="coefficient-alert my-3"
        type="info"
        text
      >
        Suggested Coefficients: A = {{ coefficients.A.toFixed(2) }}, B =
        {{ coefficients.B.toFixed(2) }}
        <br />
        You can use the coefficients to set the temperature compensation by
        using
        <code
          >G31 ... T{{ coefficients.A.toFixed(2) }}:{{
            coefficients.B.toFixed(2)
          }}</code
        >.
        <br />
        Refer to the
        <a
          href="https://docs.duet3d.com/User_manual/Reference/Gcodes/G31"
          target="_blank"
          class="underlined-link"
        >
          Duet Documentation</a
        >
        on how to set temperature coefficients for your probe.
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
    computeBestFitCurve(data, C = 0, xDelta = 0) {
      const xData = data.map((dataPoint) => dataPoint.x - xDelta);
      const yData = data.map((dataPoint) => dataPoint.y);
      return this.bestFitCurve(xData, yData, C);
    },
    bestFitCurve(x, y, C) {
      const n = x.length;
      let Sx = 0,
        Sxx = 0,
        Sxxx = 0,
        Sxxxx = 0;
      let Sy = 0,
        Sxy = 0,
        Sxxy = 0;

      for (let i = 0; i < n; i++) {
        Sx += x[i];
        Sxx += x[i] * x[i];
        Sxxx += x[i] * x[i] * x[i];
        Sxxxx += x[i] * x[i] * x[i] * x[i];
        Sy += y[i] - C;
        Sxy += x[i] * (y[i] - C);
        Sxxy += x[i] * x[i] * (y[i] - C);
      }

      const A = [
        [Sxx, Sx],
        [Sxxx, Sxx],
      ];

      const B = [Sxy, Sxxy];

      function solveLinearSystem(A, B) {
        const detA = A[0][0] * A[1][1] - A[0][1] * A[1][0];
        const A_inv = [
          [A[1][1] / detA, -A[0][1] / detA],
          [-A[1][0] / detA, A[0][0] / detA],
        ];

        const X = [
          A_inv[0][0] * B[0] + A_inv[0][1] * B[1],
          A_inv[1][0] * B[0] + A_inv[1][1] * B[1],
        ];

        return X;
      }

      const [result_A, result_B] = solveLinearSystem(A, B);

      const linear_B = Sxy / Sxx;

      let quadraticError = 0,
        linearError = 0;
      for (let i = 0; i < n; i++) {
        const quadraticY = result_A * x[i] * x[i] + result_B * x[i] + C;
        const linearY = linear_B * x[i] + C;
        quadraticError += Math.pow(y[i] - quadraticY, 2);
        linearError += Math.pow(y[i] - linearY, 2);
      }

      if (linearError < quadraticError) {
        return [0, linear_B];
      } else {
        return [result_A, result_B];
      }
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

      const [A, B] = this.computeBestFitCurve(
        data,
        this.probeData.triggerHeight,
        calibrationTemp
      );

      this.coefficients.A = A;
      this.coefficients.B = B;

      const bestFitData = data.map((dataPoint) => {
        const deltaTemp = dataPoint.x - calibrationTemp;
        const bestFitHeight =
          this.probeData.triggerHeight + B * deltaTemp + A * deltaTemp ** 2;
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
