# sainsburys-email-receipt-downloader

For downloading sainsbury's email receipts.

Useful if you shop online often and want to download a record from your emails.

Example use:

```
import SainsburysDownloader from "./SainsburysDownloader";

const dl = new SainsburysDownloader();

dl.imapHost = '...';
dl.imapPort = '...';
dl.imapTls = '...';
dl.imapUser = '...';
dl.imapPassword = '...';
dl.destinationFolder = '...';

dl.download().then(() => {
  console.log("end");
});
```
