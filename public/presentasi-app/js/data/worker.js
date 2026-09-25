/* Web Worker: parsing Excel di latar belakang supaya UI tetap responsif. */
importScripts('../../vendor/xlsx.full.min.js', '../core/util.js', 'parse.js');

onmessage = e => {
  const { id, name, buf } = e.data;
  try {
    const result = parseWorkbook_(new Uint8Array(buf), name);
    postMessage({ id: id, result: result });
  } catch (err) {
    postMessage({ id: id, error: err && err.message ? err.message : String(err) });
  }
};
