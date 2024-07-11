"use strict";

import { registerRoute } from "@/routes";

import ScanningProbe from "./ScanningProbe.vue";

// Register a route via Settings -> Object Model
registerRoute(ScanningProbe, {
  Plugins: {
    ObjectModel: {
      icon: "mdi-arrow-expand-vertical",
      caption: "Scanning Probe",
      path: "/Plugins/ScanningProbe",
    },
  },
});
