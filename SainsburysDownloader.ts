import Imap from "node-imap";
import fs from "fs";
import path from "path";
import Base64 from "js-base64";

function openInboxPromise(imap: Imap) {
  return new Promise<Imap.Box>((resolve, reject) =>
    imap.openBox("INBOX", true, (err, box) => {
      if (err) {
        reject(err);
      } else {
        resolve(box);
      }
    })
  );
}

function imapReadyPromise(imap: Imap) {
  return new Promise<void>((resolve, reject) =>
    imap.once("ready", function () {
      resolve();
    })
  );
}

function fetchEndPromise(fetch: Imap.ImapFetch) {
  return new Promise<void>((resolve, reject) => {
    fetch.once("error", function (err) {
      console.log("Fetch error: " + err);
      reject();
    });
    fetch.once("end", function () {
      resolve();
    });
  });
}

// taken from:
// https://stackoverflow.com/questions/10623798/how-do-i-read-the-contents-of-a-node-js-stream-into-a-string-variable
function streamToString(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function searchPromise(imap: Imap, searchParams: any[]) {
  return new Promise<number[]>((resolve, reject) =>
    imap.seq.search(searchParams, (err, ids) => {
      if (err) {
        reject(err);
      } else {
        resolve(ids);
      }
    })
  );
}

class SainsburysDownloader {
  imapHost?: string;

  imapPort?: number;

  imapTls?: boolean;

  imapUser: string;

  imapPassword: string;

  destinationFolder: string;

  constructor() {
    this.imapUser = "";
    this.imapPassword = "";
    this.destinationFolder = "";
  }

  async handleStream(stream: NodeJS.ReadableStream) {
    // get the stream into a string for easyparsing
    const msg = await streamToString(stream);

    // find the bit in the string where the PDF begins
    // it begins with info on the file name as well
    const startRegExp = new RegExp(
      /Content-Type: application\/pdf\; name=\"sainsburys_groceries_order_[0-9]+.pdf\"/g
    );
    const startMatchVal = startRegExp.exec(msg);

    if (startMatchVal === null) {
      console.log("couldn't find PDF content in the email");
      return;
    }

    // extract the PDF file name from the email content
    let fileName = startMatchVal[0].split(`"`)[1];
    if (this.destinationFolder !== "") {
      fileName = path.join(this.destinationFolder, fileName);
    }

    // now move to get the PDF content alone
    // start by finding the bit of the email with the PDF content
    // plus a bit extra at the end
    const stringWithExtra = msg.slice(
      startMatchVal.index + startMatchVal[0].length
    );

    // the PDF content ends with a string bracketed by hyphens
    const endRegExp = new RegExp(/--[A-z0-9]+--/g);
    const endMatchVal = endRegExp.exec(stringWithExtra);

    if (endMatchVal === null) {
      console.log("couldn't isolate PDF content in the email");
      return;
    }

    // extract PDF content and trim off whitespace from star / end
    const finalString = stringWithExtra.slice(0, endMatchVal.index).trim();

    // convert content from base64 to binary, then write to file
    // with help from https://stackoverflow.com/questions/56483097/decoding-base64-pdf-giving-broken-file
    var bin = Base64.atob(finalString);
    fs.writeFile(fileName, bin, "binary", (error) => {
      if (error) {
        throw error;
      } else {
        console.log("binary saved!");
      }
    });
  }

  async download() {
    let imap = new Imap({
      user: this.imapUser,
      password: this.imapPassword,
      host: this.imapHost,
      port: this.imapPort,
      tls: this.imapTls,
    });

    console.log("Connecting to server...");

    const ready = imapReadyPromise(imap);

    imap.connect();

    await ready;

    console.log("Connected! Opening inbox...");

    const box = await openInboxPromise(imap);

    console.log("Opened! Searching for Sainsbury's emails...");

    const ids = await searchPromise(imap, [
      ["FROM", "service@sainsburys.co.uk"],
    ]);

    console.log(`Found ${ids.length} email(s). Now getting headers...`);

    var f = imap.seq.fetch(ids, {
      bodies: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
      struct: true,
    });

    const seqNosWithPdfs: number[] = [];

    f.on("message", function (msg, seqno) {
      msg.once("attributes", function (attrs) {
        const struct = attrs.struct as [{ subtype?: string }][];
        const pdfPart = struct.find((el) => el[0] && el[0].subtype === "pdf");
        if (pdfPart) {
          console.log(`PDF found in message #${seqno}`);
          seqNosWithPdfs.push(seqno);
        } else {
          console.log(`No PDF in message #${seqno}`);
        }
      });
    });

    await fetchEndPromise(f);

    console.log(
      "Finished getting headers. Now getting body text for messages with PDFs..."
    );

    console.log(seqNosWithPdfs);

    var f = imap.seq.fetch(seqNosWithPdfs, {
      bodies: "TEXT",
      struct: true,
    });

    f.on("message", (msg, seqno) => {
      console.log("Getting body for message #%d", seqno);
      var prefix = "(#" + seqno + ") ";
      msg.on("body", (stream, info) => {
        console.log("Handling stream for message #%d", seqno);
        this.handleStream(stream);
      });
    });

    await fetchEndPromise(f);

    imap.end();
  }
}

export default SainsburysDownloader;
