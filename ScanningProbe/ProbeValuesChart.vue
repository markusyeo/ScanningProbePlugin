<style scoped>
.card-wrapper {
  padding: 0px 20px 20px 20px;
}

.chart-wrapper {
  width: 100%;
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
  width: 100%;
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
          to set the coefficients.
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
    <v-card class="card-wrapper">
      <v-row class="input-row mb-3">
        <v-col cols="9">
          <v-select
            v-model="selectedProbes"
            :items="scanningProbes"
            multiple
            :item-text="probeItemText"
            :item-value="probeItemValue"
            label="Select the scanning probes to display on the chart."
            persistent-placeholder
            hide-details
          />
        </v-col>

        <v-col cols="3" class="d-flex justify-end">
          <v-switch v-model="filterValues" label="Filter out 999999" />
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
import Chart, {
  ChartDataSets,
  MajorTickOptions,
  NestedTickOptions,
} from "chart.js";
import dateFnsLocale from "date-fns/locale/en-US";
import { Probe } from "@duet3d/objectmodel";
import Vue from "vue";

import i18n from "@/i18n";
import store from "@/store";
import Events from "@/utils/events";
import { int } from "@babylonjs/core";

const probeColors = [
  "primary",
  "red",
  "green",
  "orange",
  "grey",
  "lime",
  "black",
  "purple",
  "yellow",
  "teal",
  "brown",
  "deep-orange",
  "pink",
  "blue-grey",
];

const sampleInterval = 1000;
const defaultMinProbeValue = 0;
const defaultMaxProbevalue = 999999;
const defaultMinHeight = 0;
const defaultMaxHeight = 5;
const maxSampleTime = 120000;

interface ExtraDatasetValues {
  index: number;
  locale: string;
}

type ProbeChartDataset = ChartDataSets & ExtraDatasetValues;

interface ProbeSampleData {
  times: Array<number>;
  probeValues: ProbeChartDataset[];
}

const probeSampleData: ProbeSampleData = {
  times: [],
  probeValues: [],
};

/**
 * Make a new dataset to render temperature data
 * @param index Sensor index
 * @param numSamples Number of current samples to generate for the resulting datset
 */
function makeDataset(index: int, numSamples: int): ProbeChartDataset {
  const color = probeColors[index],
    dataset = {
      index,
      fill: false,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 2,
      label: `Probe ${index}`,
      data: new Array<number>(numSamples).fill(NaN),
      locale: i18n.locale,
      pointRadius: 0,
      pointHitRadius: 0,
      showLine: true,
    };
  return dataset;
}

/**
 * Push sensor data of a given machine to the dataset
 * @param index Index of the sensor
 * @param sensor Sensor item
 */
function pushSeriesData(index: number, sensor: Probe) {
  let machineData = probeSampleData;
  let dataset = machineData.probeValues.find((item) => item.index === index);

  if (!dataset) {
    const newDataset = makeDataset(index, probeSampleData.times.length);
    probeSampleData.probeValues.push(newDataset);
    newDataset.label = `Probe ${index.toString()}`;
    newDataset.locale = i18n.locale;
  }

  const probeValue = sensor.value ? sensor.value[0] : NaN;
  const heightParams = getHeightParams(sensor);
  const heightValue = calculateHeight(probeValue, heightParams);

  if (dataset && dataset.data) {
    dataset.data.push(probeValue);
  }

  if (heightValue !== null) {
    const heightDataset = probeSampleData.probeValues.find(
      (item) => item.index === index && item.yAxisID === "y1"
    );
    if (!heightDataset) {
      const newHeightDataset = {
        ...makeDataset(index, probeSampleData.times.length),
        yAxisID: "y1",
        label: `Height for Probe ${index}`,
        borderColor: "rgba(255, 162, 235, 0.6)",
        backgroundColor: "rgba(255, 162, 235, 0.1)",
      };
      probeSampleData.probeValues.push(newHeightDataset);
    }

    if (heightDataset && heightDataset.data) {
      heightDataset.data.push(heightValue);
    }
  }
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
  probe_reading: number,
  params: HeightCalculationParams
): number | null {
  const {
    triggerHeight: triggerHeight,
    probeValueDelta: probeValueDelta,
    A,
    B,
    C,
    probeThreshold: probeThreshold,
  } = params;

  if (probeThreshold === null) {
    // Threshold is null, do not plot
    return null;
  }

  if (A == 0 && B == 0 && C == 0) {
    return null;
  }

  const delta = probe_reading - probeThreshold;
  const height =
    probeValueDelta +
    triggerHeight +
    A * delta +
    B * delta ** 2 +
    C * delta ** 3;
  return height;
}

function getHeightParams(sensor: Probe): HeightCalculationParams {
  const heightParams: HeightCalculationParams = {
    triggerHeight: sensor.triggerHeight,
    probeValueDelta: sensor.scanCoefficients ? sensor.scanCoefficients[0] : 0,
    A: sensor.scanCoefficients ? sensor.scanCoefficients[1] : 0,
    B: sensor.scanCoefficients ? sensor.scanCoefficients[2] : 0,
    C: sensor.scanCoefficients ? sensor.scanCoefficients[3] : 0,
    probeThreshold: sensor.threshold,
    tempCoefficients: sensor.temperatureCoefficients,
  };
  return heightParams;
}

interface ProbeWithId extends Probe {
  id: number;
}

let storeSubscribed = false,
  instances: Array<{ update: () => void }> = [];

export default Vue.extend({
  computed: {
    scanningProbes(): ProbeWithId[] {
      const machine = store.state.machine.model;
      if (!machine) return [];

      return machine.sensors.probes
        .map(
          (probe, index) =>
            ({
              ...probe,
              id: index,
            } as ProbeWithId)
        )
        .filter(
          (probe): probe is ProbeWithId => probe !== null && probe.type === 11
        ); // Scanning Probes
    },
    probeIds(): number[] {
      return this.scanningProbes.map((probe) => probe.id);
    },
    darkTheme(): boolean {
      return store.state.settings.darkTheme;
    },
    selectedMachine(): string {
      return store.state.selectedMachine;
    },
    probeItemText(): (item: ProbeWithId) => string {
      return (item) => `Probe ${item.id}`;
    },
    probeItemValue(): (item: ProbeWithId) => number {
      return (item) => item.id;
    },
    getMinOrMaxValueByIndex(): (number: number, boolean: boolean) => number {
      return (index: number, getMax: boolean) => {
        if (!this.chart.data) return NaN;
        const datasets = this.chart.data.datasets;
        if (!datasets || index >= datasets.length) return NaN;
        if (getMax) {
          return Math.max(
            ...(datasets[index].data as number[]).filter(
              (value) => !isNaN(value)
            )
          );
        }
        return Math.min(
          ...(datasets[index].data as number[]).filter((value) => !isNaN(value))
        );
      };
    },
    getMinProbeValue(): number {
      this.minProbeValue =
        this.getMinOrMaxValueByIndex(0, false) ?? this.minProbeValue;
      return Math.floor(this.minProbeValue / 10) * 10;
    },
    getMaxProbeValue(): number {
      this.maxProbeValue =
        this.getMinOrMaxValueByIndex(0, true) ?? this.maxProbeValue;
      return Math.ceil(this.maxProbeValue / 10) * 10;
    },
    getMinHeight(): number {
      return 0;
    },
    getMaxHeight(): number {
      this.maxHeight = this.getMinOrMaxValueByIndex(1, true) ?? this.maxHeight;
      return Math.ceil(this.maxHeight * 10) / 10;
    },
  },
  data() {
    return {
      chart: {} as Chart,
      selectedProbes: [] as number[],
      heightParams: {} as HeightCalculationParams,
      filterValues: true,
      isMissingProbeCoefficients: false,
      minProbeValue: defaultMinProbeValue,
      maxProbeValue: defaultMaxProbevalue,
      minHeight: defaultMinHeight,
      maxHeight: defaultMaxHeight,
    };
  },
  methods: {
    initializeDefaultSelectedProbe() {
      if (this.scanningProbes.length > 0) {
        this.selectedProbes = [this.scanningProbes[0].id];
      }
    },
    initChart() {
      this.chart = new Chart(this.$refs.chart as HTMLCanvasElement, {
        type: "line",
        options: {
          animation: {
            duration: 0,
          },
          elements: {
            line: {
              tension: 0,
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
            xAxes: [
              {
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
                },
                type: "time",
              },
            ],
            yAxes: [
              {
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
                  stepSize: 10,
                },
              },
              {
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
                  stepSize: 0.2,
                },
              },
            ],
          },
        },
        data: {
          labels: probeSampleData.times,
          datasets: probeSampleData.probeValues,
        },
      });
    },
    checkMissingProbeCoefficients() {
      this.isMissingProbeCoefficients = this.scanningProbes.some((probe) => {
        return (
          probe.scanCoefficients === null ||
          // All scan coefficients are 0
          probe.scanCoefficients.every((coefficient) => coefficient === 0) ||
          probe.threshold === null
        );
      });
    },
    update() {
      // Step 1: Update y axis ticks for probe values
      this.chart.config.options!.scales!.yAxes![0].ticks!.min =
        this.getMinProbeValue;
      this.chart.config.options!.scales!.yAxes![0].ticks!.max =
        this.getMaxProbeValue;

      // Step 2: Update y axis ticks for height values
      this.checkMissingProbeCoefficients();
      this.chart.config.options!.scales!.yAxes![1].ticks!.min =
        this.getMinHeight;
      this.chart.config.options!.scales!.yAxes![1].ticks!.max =
        this.getMaxHeight;

      // Step 3: Update the time axis
      const now = new Date().getTime();
      this.chart.config.options!.scales!.xAxes![0].ticks!.min =
        now - maxSampleTime;
      this.chart.config.options!.scales!.xAxes![0].ticks!.max = now;

      this.chart.update();
    },
    applyDarkTheme(active: boolean) {
      const ticksColor = active ? "#FFF" : "#666";
      this.chart.config.options!.legend!.labels!.fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.xAxes![0].ticks!
          .minor as NestedTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.xAxes![0].ticks!
          .major as MajorTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.yAxes![0].ticks!
          .minor as NestedTickOptions
      ).fontColor = ticksColor;
      (
        this.chart.config.options!.scales!.yAxes![0].ticks!
          .major as MajorTickOptions
      ).fontColor = ticksColor;

      const gridLineColor = active
        ? "rgba(255,255,255,0.15)"
        : "rgba(0,0,0,0.15)";
      this.chart.config.options!.scales!.xAxes![0].gridLines!.color =
        gridLineColor;
      this.chart.config.options!.scales!.yAxes![0].gridLines!.color =
        gridLineColor;
      this.chart.config.options!.scales!.yAxes![0].gridLines!.zeroLineColor =
        gridLineColor;

      this.chart.update();
    },
  },
  created() {},
  mounted() {
    this.initChart();
    this.checkMissingProbeCoefficients();
    this.initializeDefaultSelectedProbe();

    instances.push(this);

    if (!storeSubscribed) {
      this.$root.$on(Events.machineModelUpdated, () => {
        const dataset = probeSampleData,
          now = new Date().getTime();

        if (
          dataset.times.length === 0 ||
          now - dataset.times[dataset.times.length - 1] > sampleInterval
        ) {
          dataset.times.push(now);

          store.state.machine.model.sensors.probes.forEach(
            (probe, probeIndex) => {
              if (probe && probe.type === 11 /* Scanning Probe */) {
                pushSeriesData(probeIndex, probe);
              }
            }
          );

          while (
            dataset.times.length &&
            now - dataset.times[0] > maxSampleTime
          ) {
            dataset.times.shift();
            dataset.probeValues.forEach((data) => data.data!.shift());
          }

          instances.forEach((instance) => instance.update());
        }
      });
      storeSubscribed = true;
    }
  },
  beforeDestroy() {
    instances = instances.filter((instance) => instance !== this, this);
  },
  watch: {
    darkTheme(to: boolean) {
      this.applyDarkTheme(to);
    },
    filterValues(newVal) {
      this.chart.data.datasets!.forEach((dataset) => {
        if (newVal) {
          dataset.data = (dataset.data as number[]).map((value) =>
            value === 999999 ? NaN : value
          );
        } else {
          dataset.data = (dataset.data as number[]).map((value) =>
            isNaN(value) ? 999999 : value
          );
        }
      });
      this.update();
    },
    selectedMachine() {
      this.chart.config.data = {
        labels: probeSampleData.times,
        datasets: probeSampleData.probeValues,
      };
      this.update();
    },
  },
});
</script>
