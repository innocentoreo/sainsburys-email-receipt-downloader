import Imap from "node-imap";
import fs from "fs";

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

  constructor() {
    this.imapUser = "";
    this.imapPassword = "";
  }

  async download() {
    let imap = new Imap({
      user: this.imapUser,
      password: this.imapPassword,
      host: this.imapHost,
      port: this.imapPort,
      tls: this.imapTls,
    });

    console.log("wait");

    const ready = imapReadyPromise(imap);

    imap.connect();

    await ready;

    const box = await openInboxPromise(imap);

    const ids = await searchPromise(imap, [
      ["FROM", "service@sainsburys.co.uk"],
    ]);

    console.log(ids);

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
          seqNosWithPdfs.push(seqno);
        }
      });
    });

    await fetchEndPromise(f);

    console.log(seqNosWithPdfs);

    var f = imap.seq.fetch(seqNosWithPdfs, {
      bodies: "TEXT",
      struct: true,
    });

    f.on("message", function (msg, seqno) {
      console.log("Message #%d", seqno);
      var prefix = "(#" + seqno + ") ";
      msg.on("body", function (stream, info) {
        stream.pipe(fs.createWriteStream("msg-" + seqno + "-body.txt"));
      });
    });

    await fetchEndPromise(f);

    imap.end();
  }
}

export default SainsburysDownloader;
