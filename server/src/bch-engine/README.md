# bch-engine

The Bitcoin Cash payment engine from
[bch_cashtoken_checkout](https://github.com/btheis15/bch_cashtoken_checkout) (`src/`), copied as is.
The website's payment screen (`src/components/bch/` at the repo root) is that repo's `examples/react/`.

`server/src/bch.js` wires it to the garage sale: storage in SQLite (`bch_payments`,
`bch_addresses`, `bch_meta`), and the order turned Paid when the payment counts. To take a newer
version, copy the files over again; nothing in here was changed.
