<style scoped>
.chart-wrapper {
  width: 100%;
  height: 100%;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #ddd;
}

canvas {
  width: 100% !important;
  height: 100% !important;
  background: transparent;
  border-radius: 8px;
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
}

.coefficient-alert {
  width: 100%;
  display: flex;
  align-items: center;
}
</style>

<template>
  <v-container fluid>
    <v-row>
      <v-col>
        <v-alert v-if="isMissingProbeCoefficients" type="warning" text>
          Scanning probe coefficients are not available. Please run
          <code>M558.1 ...</code>
          to determine and set the coefficients.
          <br />
          Refer to
          <a
            href="https://docs.duet3d.com/en/Duet3D_hardware/Duet_3_family/Duet_3_Scanning_Z_Probe"
            target="_blank"
            >Duet Documentation on Scanning Probe</a
          >
          for more information.
        </v-alert>
      </v-col>
    </v-row>
    <v-card>
      <v-row class="input-row mb-3">
        <v-col cols="9">
          <v-select
            v-model="selectedProbeIds"
            :items="scanningProbes"
            multiple
            :item-text="probeItemText"
            :item-value="probeItemValue"
            label="Select the scanning probes to display on the chart"
            persistent-placeholder
            hide-details
          />
        </v-col>
      </v-row>

      <v-row>
        <v-col>
          <div class="chart-wrapper">
            <canvas ref="chart"></canvas>
          </div>
        </v-col>
      </v-row>
    </v-card>
  </v-container>
</template>

<script lang="ts">
import Vue from "vue";
import { Chart, ChartDataSets, MajorTickOptions, NestedTickOptions } from "chart.js";
import dateFnsLocale from "date-fns/locale/en-US";
import { Probe, ProbeType } from "@duet3d/objectmodel";
import i18n from "@/i18n";
import store from "@/store";
import Events from "@/utils/events";
import { int } from "@babylonjs/core";

const probeValueColors = [
  "#FF5733", // Vibrant Red-Orange
  "#33A1FF", // Bright Blue
  "#28A745", // Rich Green
  "#FFC300", // Bright Yellow
  "#8E44AD", // Deep Purple
  "#FF6F61", // Coral
  "#1ABC9C", // Turquoise
  "#E74C3C", // Strong Red
  "#3498DB", // Strong Blue
  "#2ECC71", // Soft Green
  "#F39C12", // Orange
  "#D35400", // Dark Orange
];

const probeHeightColors = [
  "#FF8F66", // Soft Coral (Complimentary to #FF5733)
  "#66C2FF", // Light Sky Blue (Complimentary to #33A1FF)
  "#58D68D", // Soft Green (Complimentary to #28A745)
  "#FFD966", // Soft Yellow (Complimentary to #FFC300)
  "#A569BD", // Light Lavender (Complimentary to #8E44AD)
  "#FF9F80", // Light Peach (Complimentary to #FF6F61)
  "#48C9B0", // Light Teal (Complimentary to #1ABC9C)
  "#F1948A", // Light Pink (Complimentary to #E74C3C)
  "#85C1E9", // Light Blue (Complimentary to #3498DB)
  "#A2D9CE", // Mint Green (Complimentary to #2ECC71)
  "#F5B041", // Light Orange (Complimentary to #F39C12)
  "#E67E22", // Soft Orange (Complimentary to #D35400)
];

const sampleInterval = 1000;
const defaultMinProbeValue = 0;
const defaultMaxProbeValue = 999999;
const defaultMinHeight = 0;
const defaultMaxHeight = 5;
const maxSampleTime = 180000;

interface ExtraDatasetValues {
  index: number;
  locale: string;
}

type ProbeChartDataset = ChartDataSets & ExtraDatasetValues;

interface ProbeSampleData {
  times: number[];
  probeValues: ProbeChartDataset[];
}

function makeDataset(
  index: int,
  numSamples: int,
  colorSet: "probe" | "height"
): ProbeChartDataset {
  const color = colorSet === "probe"
    ? probeValueColors[index % probeValueColors.length]
    : probeHeightColors[index % probeHeightColors.length];
  const label = colorSet === "probe" ? `Probe ${index}` : `Height for Probe ${index}`;
  const yAxisID = colorSet === "probe" ? "y0" : "y1";

  return {
    index,
    yAxisID,
    fill: false,
    backgroundColor: color,
    borderColor: color,
    borderWidth: 2,
    label,
    data: new Array<number>(numSamples).fill(NaN),
    locale: i18n.locale,
    pointRadius: 0,
    pointHitRadius: 0,
    pointBackgroundColor: color,
    showLine: true,
  };
}

interface HeightCalculationParams {
  triggerHeight: number;
  probeValueDelta: number;
  A: number;
  B: number;
  C: number;
  probeThreshold: number;
  tempCoefficients: number[];
}

function calculateHeight(
  probeReading: number,
  params: HeightCalculationParams
): number | null {
  const { triggerHeight, probeValueDelta, A, B, C, probeThreshold } = params;

  if (!probeThreshold || probeThreshold === 500 || (A === 0 && B === 1 && C === 0)) {
    return null;
  }

  const delta = probeReading - probeThreshold;
  return probeValueDelta + triggerHeight + A * delta + B * delta ** 2 + C * delta ** 3;
}

function getHeightParams(sensor: Probe): HeightCalculationParams {
  const scanCoefficients = sensor.scanCoefficients ?? [0, 0, 1, 0];
  return {
    triggerHeight: sensor.triggerHeight,
    probeValueDelta: scanCoefficients[0],
    A: scanCoefficients[1],
    B: scanCoefficients[2],
    C: scanCoefficients[3],
    probeThreshold: sensor.threshold,
    tempCoefficients: sensor.temperatureCoefficients,
  };
}

interface ProbeWithId extends Probe {
  id: number;
}

let storeSubscribed = false;
const instances: Array<{ update: () => void }> = [];

export default Vue.extend({
  data() {
    return {
      chart: {} as Chart,
      selectedProbeIds: [] as number[],
      isMissingProbeCoefficients: true,
      hasInvalidProbeValues: false,
      minProbeValue: defaultMinProbeValue,
      maxProbeValue: defaultMaxProbeValue,
      minHeight: defaultMinHeight,
      maxHeight: defaultMaxHeight,
      probeSampleData: {
        times: [],
        probeValues: [],
      } as ProbeSampleData,
    };
  },
  computed: {
    scanningProbes(): ProbeWithId[] {
      const machine = store.state.machine.model;
      if (!machine) return [];
      return machine.sensors.probes
        .map((probe, index) => ({ ...probe, id: index } as ProbeWithId))
        .filter((probe): probe is ProbeWithId => probe !== null && probe.type === ProbeType.scanningAnalog);
    },
    selectedProbes(): ProbeWithId[] {
      return this.scanningProbes.filter((probe) => this.selectedProbeIds.includes(probe.id));
    },
    probeItemText(): (item: ProbeWithId) => string {
      return (item) => `Probe ${item.id}`;
    },
    probeItemValue(): (item: ProbeWithId) => number {
      return (item) => item.id;
    },
    getMinProbeValue(): number {
      this.minProbeValue = this.getMinOrMaxValueByIndex(0, false) ?? this.minProbeValue;
      return Math.floor(this.minProbeValue / 10) * 10;
    },
    getMaxProbeValue(): number {
      this.maxProbeValue = this.getMinOrMaxValueByIndex(0, true) ?? this.maxProbeValue;
      return Math.ceil(this.maxProbeValue / 10) * 10;
    },
    getProbeValueStepSize(): int {
      return (this.getMaxProbeValue - this.getMinProbeValue) / 10;
    },
    getProbeHeightStepSize(): number {
      return (this.getMaxHeight - this.getMinHeight) / 10;
    },
    getMinHeight(): number {
      return 0;
    },
    getMaxHeight(): number {
      this.maxHeight = this.getMinOrMaxValueByIndex(1, true) ?? this.maxHeight;
      return Math.ceil(this.maxHeight * 10) / 10;
    },
  },
  methods: {
    initializeDefaultSelectedProbe() {
      if (this.scanningProbes.length > 0) {
        this.selectedProbeIds = [this.scanningProbes[0].id];
      }
    },
    initChart() {
      this.chart = new Chart(this.$refs.chart as HTMLCanvasElement, {
        type: "line",
        options: this.getChartOptions(),
        data: {
          labels: this.probeSampleData.times,
          datasets: this.probeSampleData.probeValues,
        },
      });
    },
    getChartOptions(): Chart.ChartOptions {
      return {
        animation: {
          duration: 0,
        },
        elements: {
          line: {
            tension: 0,
          },
          point: {
            radius: 3,
            hoverRadius: 6,
          },
        },
        legend: {
          labels: {
            filter: (legendItem, data) =>
              data.datasets![legendItem.datasetIndex!].showLine,
            fontFamily: "Roboto,sans-serif",
          },
        },
        maintainAspectRatio: false,
        responsive: true,
        responsiveAnimationDuration: 0,
        scales: {
          xAxes: [this.getTimeAxis()],
          yAxes: [this.getProbeValueAxis(), this.getHeightAxis()],
        },
        tooltips: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (tooltipItem, data) => {
              const dataset = data.datasets![tooltipItem.datasetIndex!];
              const label = dataset.label || '';
              const value = tooltipItem.yLabel;
              return `${label}: ${value}`;
            },
          },
        },
        hover: {
          mode: 'index',
          intersect: false,
        },
      };
    },
    getTimeAxis(): Chart.ChartXAxe {
      return {
        adapters: {
          date: {
            locale: dateFnsLocale,
          },
        },
        gridLines: {
          display: true,
        },
        scaleLabel: {
          display: true,
          labelString: "Time",
        },
        ticks: {
          min: new Date().getTime() - maxSampleTime,
          max: new Date().getTime(),
          minor: {
            fontFamily: "Roboto,sans-serif",
          },
          major: {
            fontFamily: "Roboto,sans-serif",
          },
        },
        time: {
          unit: "minute",
          displayFormats: {
            minute: "HH:mm",
          },
          stepSize: 1
        },
        type: "time",
      };
    },
    getProbeValueAxis(): Chart.ChartYAxe {
      return {
        id: "y0",
        position: "left",
        gridLines: {
          display: true,
        },
        scaleLabel: {
          display: true,
          labelString: "Probe Value",
        },
        ticks: {
          minor: {
            fontFamily: "Roboto,sans-serif",
          },
          major: {
            fontFamily: "Roboto,sans-serif",
          },
          min: this.getMinProbeValue,
          max: this.getMaxProbeValue,
          stepSize: this.getProbeValueStepSize,
        },
      };
    },
    getHeightAxis(): Chart.ChartYAxe {
      return {
        id: "y1",
        position: "right",
        scaleLabel: {
          display: true,
          labelString: "Height (mm)",
        },
        ticks: {
          minor: {
            fontFamily: "Roboto,sans-serif",
          },
          major: {
            fontFamily: "Roboto,sans-serif",
          },
          min: this.getMinHeight,
          max: this.getMaxHeight,
          stepSize: this.getProbeHeightStepSize,
        },
      };
    },
    getMinOrMaxValueByIndex(index: number, getMax: boolean): number {
      if (!this.chart.data || !this.chart.data.datasets || index >= this.chart.data.datasets.length) {
        return NaN;
      }
      const filteredData = (this.chart.data.datasets[index].data as number[]).filter((value) => !isNaN(value));
      return getMax ? Math.max(...filteredData) : Math.min(...filteredData);
    },
    checkMissingProbeCoefficients() {
      this.isMissingProbeCoefficients = this.selectedProbes.some((probe) => {
        const coefficients = probe.scanCoefficients ?? [0, 0, 1, 0];
        return (
          probe.threshold === null ||
          (coefficients[0] === 0 && coefficients[1] === 0 && coefficients[2] === 1 && coefficients[3] === 0)
        );
      });
    },
    pushSeriesData(index: number, sensor: Probe) {
      const machineData = this.probeSampleData;
      const probeValue = sensor.value ? sensor.value[0] : NaN;
      const heightParams = getHeightParams(sensor);
      const heightValue = calculateHeight(probeValue, heightParams);

      if (probeValue === 999999) {
        this.hasInvalidProbeValues = true;
        return;
      }

      let dataset = machineData.probeValues.find((item) => item.index === index);
      if (!dataset) {
        dataset = makeDataset(index, machineData.times.length, "probe");
        machineData.probeValues.push(dataset);
      }

      if (!isNaN(probeValue)) {
        dataset.data!.push(probeValue);
      }
      if (heightValue !== null && sensor.scanCoefficients?.some((coef) => coef !== 0)) {
        let heightDataset = machineData.probeValues.find(
          (item) => item.index === index && item.yAxisID === "y1"
        );
        if (!heightDataset) {
          heightDataset = makeDataset(index, machineData.times.length, "height");
          machineData.probeValues.push(heightDataset);
        }
        heightDataset.data!.push(heightValue);
      }
    },
    removeOldDataPoints(dataset: ProbeSampleData, now: number) {
      while (dataset.times.length && now - dataset.times[0] > maxSampleTime) {
        dataset.times.shift();
        dataset.probeValues.forEach((data) => data.data!.shift());
      }
    },
    update() {
      if (this.chart.data.datasets!.length > 0) {
        this.chart.config.options!.scales!.yAxes![0].ticks!.min = this.getMinProbeValue;
        this.chart.config.options!.scales!.yAxes![0].ticks!.max = this.getMaxProbeValue;
        this.chart.config.options!.scales!.yAxes![0].ticks!.stepSize = this.getProbeValueStepSize;
        this.chart.config.options!.scales!.yAxes![1].ticks!.min = this.getMinHeight;
        this.chart.config.options!.scales!.yAxes![1].ticks!.max = this.getMaxHeight;
        this.chart.config.options!.scales!.yAxes![1].ticks!.stepSize = this.getProbeHeightStepSize;
        this.chart.config.options!.scales!.xAxes![0].ticks!.min = new Date().getTime() - maxSampleTime;
        this.chart.config.options!.scales!.xAxes![0].ticks!.max = new Date().getTime();
        this.chart.update();
      }
    },
    applyDarkTheme(active: boolean) {
      const ticksColor = active ? "#FFF" : "#666";
      this.chart.config.options!.legend!.labels!.fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.xAxes![0].ticks!.minor as NestedTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.xAxes![0].ticks!.major as MajorTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.yAxes![0].ticks!.minor as NestedTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.yAxes![0].ticks!.major as MajorTickOptions
      ).fontColor = ticksColor;

      const gridLineColor = active ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
      this.chart.config.options!.scales!.xAxes![0].gridLines!.color = gridLineColor;
      this.chart.config.options!.scales!.yAxes![0].gridLines!.color = gridLineColor;
      this.chart.config.options!.scales!.yAxes![0].gridLines!.zeroLineColor = gridLineColor;

      if (this.chart.data.datasets!.length > 0) {
        this.chart.update();
      }
    },
    updateData() {
      const dataset = this.probeSampleData;
      const now = new Date().getTime();

      // Add a new time point if necessary
      if (!dataset.times.length || now - dataset.times[dataset.times.length - 1] > sampleInterval) {
        dataset.times.push(now);

        // Iterate over the selected probes and update their data
        this.selectedProbes.forEach((probe) => {
          if (probe && probe.type === ProbeType.scanningAnalog) {
            this.pushSeriesData(probe.id, probe);
          }
        });

        // Remove old data points exceeding the max sample time
        this.removeOldDataPoints(dataset, now);

        // Check for missing coefficients after updating data
        this.checkMissingProbeCoefficients();

        // Update all chart instances
        instances.forEach((instance) => instance.update());
      }
    },
  },
  mounted() {
    this.initChart();

    this.initializeDefaultSelectedProbe();
    this.updateData();

    this.checkMissingProbeCoefficients();

    instances.push(this);

    if (!storeSubscribed) {
      this.$root.$on(Events.machineModelUpdated, this.updateData);
      storeSubscribed = true;
    }
  },
  beforeDestroy() {
    instances.splice(instances.indexOf(this), 1);
  },
  watch: {
    darkTheme(to: boolean) {
      this.applyDarkTheme(to);
    },
    selectedMachine() {
      this.chart.config.data = {
        labels: this.probeSampleData.times,
        datasets: this.probeSampleData.probeValues,
      };
      this.update();
    },
  },
});
</script>
