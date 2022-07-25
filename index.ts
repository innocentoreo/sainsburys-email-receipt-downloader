import SainsburysDownloader from "./SainsburysDownloader";

const dl = new SainsburysDownloader();

dl.download().then(() => {
  console.log("end");
});
