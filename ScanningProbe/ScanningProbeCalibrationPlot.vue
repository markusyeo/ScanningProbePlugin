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
      <div class="input-row">
        <v-text-field
          label="Coefficient A"
          v-model.number="coefficients.A"
          type="number"
          @input="updateBestFitCurve"
          outlined
          persistent-placeholder
        />
        <v-text-field
          label="Coefficient B"
          v-model.number="coefficients.B"
          type="number"
          @input="updateBestFitCurve"
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
        Suggested Coefficients: A = {{ coefficients.A }},
         B = {{ coefficients.B }}
        <br />
        You can use the coefficients to set the temperature compensation by
        using
        <code
          >G31 ... T{{ coefficients.A }}:{{ coefficients.B }} S{{calibrationTemp}}</code
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

<script lang="ts">
import { defineComponent } from "vue";
import { Chart, ChartData, ChartOptions } from "chart.js";

interface ScanCoefficients {
  probeValueDelta: number | null;
  A: number | null;
  B: number | null;
  C: number | null;
}

interface ProbeData {
  scanCoefficients: ScanCoefficients;
  probeThreshold: number | null;
  triggerHeight: number | null;
}

interface Coefficients {
  A: number;
  B: number;
}

interface ChartDataPoint {
  x: number;
  y: number;
}

export default defineComponent({
  data() {
    return {
      scatterChart: null as Chart | null,
      calibrationTemp: 25,
      probeData: {
        scanCoefficients: { probeValueDelta: null, A: null, B: null, C: null },
        probeThreshold: null,
        triggerHeight: null,
      } as ProbeData,
      chartData: {
        datasets: [
          {
            label: "Delta From Trigger Height",
            data: [] as ChartDataPoint[],
            backgroundColor: "rgba(255, 0, 0, 0.5)",
            borderColor: "rgba(255, 0, 0, 1)",
            type: "line",
            fill: false,
          },
          {
            label: "Best Fit Curve",
            data: [] as ChartDataPoint[],
            borderColor: "rgba(54, 162, 235, 1)",
            backgroundColor: "rgba(54, 162, 235, 0.5)",
            type: "line",
            fill: false,
          },
        ],
      },
      containsInvalidValues: false,
      jsonLoaded: false,
      coefficients: { A: 0, B: 0 } as Coefficients,
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
      const ctx = (
        this.$refs.scatterChart as HTMLCanvasElement | null
      )?.getContext("2d");
      if (ctx) {
        const data: ChartData = {
          datasets: this.chartData.datasets,
        };

        const options: ChartOptions = {
          responsive: true,
          scales: {
            xAxes: [
              {
                type: "linear",
                position: "bottom",
                scaleLabel: {
                  display: true,
                  labelString: "Probe Temp (°C)",
                },
              },
            ],
            yAxes: [
              {
                scaleLabel: {
                  display: true,
                  labelString: "Height (mm)",
                },
              },
            ],
          },
        };

        this.scatterChart = new Chart(ctx, {
          type: "scatter",
          data,
          options,
        });
      }
    },
    onFileChange(file: File) {
      if (file) {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const jsonContent = event.target?.result as string;
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
      this.probeData = {
        scanCoefficients: { probeValueDelta: null, A: null, B: null, C: null },
        probeThreshold: null,
        triggerHeight: null,
      };
    },
    parseJsonData(jsonContent: string) {
      try {
        const jsonData = JSON.parse(jsonContent);
        this.readProbeSettings(jsonData);
        this.readProbeData(jsonData);
        this.updateScatterChart();
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    },
    computeHeight(probeValue: number) {
      const probeDelta = probeValue - this.probeData.probeThreshold!;
      const { A, B, C } = this.probeData.scanCoefficients;
      return (
        A! * probeDelta +
        B! * probeDelta ** 2 +
        C! * probeDelta ** 3
      );
    },
    computeBestFitCurve(data: ChartDataPoint[], xDelta = 0) {
      const xData = data.map((dataPoint) => dataPoint.x - xDelta);
      const yData = data.map((dataPoint) => dataPoint.y);
      return this.bestFitCurve(xData, yData);
    },
    bestFitCurve(x: number[], y: number[]) {
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
        Sy += y[i];
        Sxy += x[i] * (y[i]);
        Sxxy += x[i] * x[i] * (y[i]);
      }

      const A = [
        [Sxx, Sx],
        [Sxxx, Sxx],
      ];

      const B = [Sxy, Sxxy];

      function solveLinearSystem(A: number[][], B: number[]) {
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

      const [result_B, result_A] = solveLinearSystem(A, B);

      const linear_A = Sxy / Sxx;

      let quadraticError = 0,
        linearError = 0;
      for (let i = 0; i < n; i++) {
        const quadraticY = result_B * x[i] * x[i] + result_A * x[i];
        const linearY = linear_A * x[i];
        quadraticError += Math.pow(y[i] - quadraticY, 2);
        linearError += Math.pow(y[i] - linearY, 2);
      }

      if (linearError < quadraticError) {
        return [linear_A, 0];
      } else {
        return [result_A, result_B];
      }
    },
    readProbeData(jsonData: any) {
      const validData: ChartDataPoint[] = [];
      const probeTemps: number[] = [];

      this.containsInvalidValues = false;

      jsonData.calibrationValues.forEach(
        (dataPoint: [number, number, number]) => {
          const [bedTemp, probeTemp, probeValue] = dataPoint;

          if (probeValue === 999999) {
            this.containsInvalidValues = true;
          } else {
            const height = this.computeHeight(probeValue);
            validData.push({ x: probeTemp, y: -1 * height });
            probeTemps.push(probeTemp);
          }
        }
      );

      this.chartData.datasets[0].data = validData;
      this.calibrationTemp = Math.min(...probeTemps);
    },
    readProbeSettings(jsonData: any) {
      this.probeData.scanCoefficients = jsonData.scanCoefficients;
      this.probeData.probeThreshold = jsonData.probeThreshold;
      this.probeData.triggerHeight = jsonData.triggerHeight;
    },
    computeTemperatureCoefficients() {
      const data = this.chartData.datasets[0].data;
      const calibrationTemp = this.calibrationTemp;

      const [A, B] = this.computeBestFitCurve(
        data,
        calibrationTemp
      );

      this.coefficients.A = parseFloat(A.toFixed(5));
      this.coefficients.B = parseFloat(B.toFixed(5));

      const bestFitData = data.map((dataPoint) => {
        const deltaTemp = dataPoint.x - calibrationTemp;
        const bestFitHeight = A * deltaTemp + B * deltaTemp ** 2;
        return { x: dataPoint.x, y: bestFitHeight };
      });

      this.chartData.datasets[1].data = bestFitData;

      this.updateScatterChart();
    },
    updateBestFitCurve() {
      this.coefficients.A = parseFloat(this.coefficients.A.toFixed(5));
      this.coefficients.B = parseFloat(this.coefficients.B.toFixed(5));
      
      const A = this.coefficients.A;
      const B = this.coefficients.B;

      const calibrationTemp = this.calibrationTemp;

      const bestFitData = this.chartData.datasets[0].data.map((dataPoint) => {
        const deltaTemp = dataPoint.x - calibrationTemp;
        const bestFitHeight = A * deltaTemp + B * deltaTemp ** 2;
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
})
</script>
