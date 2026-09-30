export const presetScreens = {
  "1:1": {
    name: "square",
    resolutions: {
      hd: { width: 1080, height: 1080 },
      fhd: { width: 1200, height: 1200 },
    },
  },
  "16:9": {
    name: "landscape",
    resolutions: {
      hd: { width: 1280, height: 720 },
      fhd: { width: 1920, height: 1080 },
    },
  },
  "9:16": {
    name: "portrait",
    resolutions: {
      hd: { width: 720, height: 1280 },
      fhd: { width: 1080, height: 1920 },
    },
  },
  "4:3": {
    name: "classic",
    resolutions: {
      hd: { width: 1024, height: 768 },
      fhd: { width: 1600, height: 1200 },
    },
  },
  "3:2": {
    name: "photo",
    resolutions: {
      hd: { width: 1080, height: 720 },
      fhd: { width: 1440, height: 960 },
    },
  },
};
