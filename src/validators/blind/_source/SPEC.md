# Specifications (telos) and example inputs

Each domain converts ONE raw input string into ONE target record, or rejects it.
The examples below are ordinary (valid) inputs, one per input format.

## Domain `financial`

### Telos

```
Target record (the FINAL, immutable goal — "telos"):
{
  "audit_id":     non-empty string — the transaction identifier copied verbatim from the input,
  "value_in_usd": positive number — the transaction amount converted to USD using EXACTLY these rates:
                  BRL * 0.2, USD * 1, EUR * 1.1, GBP * 1.27
                  (informal names: real=BRL, dolar=USD, euro=EUR, libra=GBP; codes may be lowercase).
                  If the input already gives the value in USD (e.g. a field named value_usd), do not convert it again.
                  Brazilian number format "1.234,56" means 1234.56,
  "date":         string "DD/MM/YYYY" — the UTC calendar date of the transaction
                  (convert timestamps with offsets to UTC first; timestamps without offset are already UTC),
  "category":     "domestic" if the currency is BRL, otherwise "international",
  "status":       "valid"
}
Rejection rule: if a record cannot be converted faithfully — missing currency, missing date,
amount that is zero, negative or not a number, currency outside {BRL, USD, EUR, GBP}, or a record
that is not a financial transaction at all — it must be REJECTED, never guessed.
```

### Example inputs (one per format)

```
{"transaction_id":"TX0000","amount":714.46,"currency":"BRL","timestamp":"2024-04-04T07:39:00Z"}
```

```
{"id_transacao":"TX1000","valor":939.83,"moeda":"BRL","data_hora":"2024-12-18T23:54:00-03:00"}
```

```
{"ref":"TX2000","value_usd":265.99,"orig_currency":"BRL","date":"2024-02-28","category":"domestic"}
```

```
TX3000|real|6.738,16|18-mai-2024
```

```
2024-04-26T03:24:00Z,USD,4434.39,TX4000
```

```
id=TX5000 | valor=R$ 6.633,82 | quando=2024-08-28 08:47:13 -03:00
```

```
{"payment":{"ref":"TX6000","money":{"value":"2181.38","ccy":"eur"}},"created_at":1731406380}
```

```
<tx><id>TX7000</id><amount currency="GBP">1839.59</amount><timestamp>2024-10-22T20:53:31+01:00</timestamp></tx>
```

```
{"codigo":"TX8000","total":"1.821,34","divisa":"dolar","emissao":"2024-03-20T09:05:38+05:30"}
```

## Domain `iot`

### Telos

```
Target record (the FINAL, immutable goal — "telos"):
{
  "device_id":     non-empty string — the device identifier copied verbatim from the input,
  "metric":        "temperature" | "humidity" | "pressure"   (temp/hum/humid/press are abbreviations),
  "value":         number in the canonical unit, rounded to 2 decimals:
                   temperature in Celsius (convert from Fahrenheit: (F-32)*5/9; from Kelvin: K-273.15),
                   humidity in percent, pressure in hPa (1 mbar = 1 hPa; 1 kPa = 10 hPa).
                   Decimal comma "23,5" means 23.5,
  "timestamp_utc": string "YYYY-MM-DDTHH:MM:SSZ" (timestamps without offset are UTC; a date without time means 00:00:00),
  "status":        derived from the canonical value:
                   temperature: "critical" if > 40 or < -5, "warning" if > 30 or < 0, else "normal";
                   humidity:    "critical" if > 90, "warning" if > 75, else "normal";
                   pressure:    "critical" if < 960 or > 1040, "warning" if < 980 or > 1030, else "normal",
  "zone":          "north" | "south" | "east" | "west"  (N/S/E/W are abbreviations;
                   vendor zones map as zone-A=north, zone-B=south, zone-C=east, zone-D=west)
}
Rejection rule: if a record cannot be converted faithfully — missing metric, missing timestamp,
missing zone, a value that is not a number, a physically impossible value
(temperature outside [-60, 70] °C, humidity outside [0, 100] %, pressure outside [850, 1100] hPa),
or a record that is not sensor telemetry at all — it must be REJECTED, never guessed.
```

### Example inputs (one per format)

```
{"device_id":"SENS-0000","metric":"temperature","value":-2.24,"unit":"celsius","timestamp":"2024-04-04T07:39:00Z","zone":"north"}
```

```
{"sensor_id":"SENS1000","reading_type":"temp","reading_value":0.25,"measurement_unit":"C","recorded_at":"2024-12-18 17:54:00","location":"zone-A"}
```

```
{"id":"SENS-2000","type":"temperature","val":19.08,"unit":"fahrenheit","ts":"2024-02-28","area":"N"}
```

```
SENS3000|temp|88.09|F|may-18-2024|north
```

```
SENS4000,temperature,311.92,K,2024-04-26T03:24:00Z,north
```

```
dev=SENS-5000 | temp=14.99°F | at=2024-02-04 13:51:57 +02:00 | zone=N
```

```
{"device":{"id":"SENS6000","zone":"zone-A"},"reading":{"kind":"humidity","value":"79,93","unit":"%RH"},"ts":1717679640}
```

```
<reading device="SENS7000" zone="S"><pressure unit="kPa">101.871</pressure><time>2024-08-08T05:47:38-05:00</time></reading>
```

```
{"node":"SENS-8000","measure":"temp","reading":"275.27 K","epoch_ms":1713106500000,"area":"E"}
```

## Domain `usgs-corrected`

### Telos

```
Target record (the FINAL, immutable goal — "telos"):
{
  "event_id":       non-empty string — the USGS event id (GeoJSON "id"; CSV column "id"),
  "magnitude":      number — the event magnitude,
  "magnitude_type": lowercase string, one of: ml, md, mb, mw, mww, mwb, mwc, mwr, ms, mb_lg, mi, mh,
  "latitude":       number in [-90, 90],
  "longitude":      number in [-180, 180],
  "timestamp_utc":  origin time as "YYYY-MM-DDTHH:MM:SSZ" (UTC, milliseconds truncated),
  "place":          non-empty string — the place description verbatim,
  "event_type":     string — the event type verbatim (e.g. "earthquake", "quarry blast", "explosion"),
  "status":         "reviewed" or "automatic",
  "depth_km":       number in [-10, 800] (negative depths — above the reference datum — are valid),
  "significance":   integer in [0, 2500] taken from the source field "sig", or null when the source has no such field
}
Inputs arrive either as a single GeoJSON Feature (JSON string; coordinates are [lon, lat, depth_km],
"time" is epoch milliseconds) or as a single CSV line WITHOUT header in the USGS FDSN column order:
time,latitude,longitude,depth,mag,magType,nst,gap,dmin,rms,net,id,updated,place,type,horizontalError,depthError,magError,magNst,status,locationSource,magSource
(place is double-quoted when it contains commas).
Rejection rule: if a required value is missing from the source, the record must be REJECTED, never guessed.
```

### Example inputs (one per format)

```
{"type":"Feature","properties":{"mag":4.3,"place":"241 km SE of Chiniak, Alaska","time":1711929411209,"updated":1717278950040,"tz":null,"url":"https://earthquake.usgs.gov/earthquakes/eventpage/us7000m94h","detail":"https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000m94h&format=geojson","felt":null,"cdi":null,"mmi":1,"alert":null,"status":"reviewed","tsunami":0,"sig":284,"net":"us","code":"7000m94h","ids":",ak02446vxnsz,us7000m94h,","sources":",ak,us,","types":",origin,phase-data,shakemap,","nst":74,"dmin":2.412,"rms":0.65,"gap":192,"magType":"mb","type":"earthquake","title":"M 4.3 - 241 km SE of Chiniak, Alaska"},"geometry":{"type":"Point","coordinates":[-149.6909,55.9718,13.098]},"id":"us7000m94h"}
```

```
2024-06-30T23:28:24.780Z,17.976166666667,-66.6825,10.8,2.62,md,17,148,0.07367,0.07,pr,pr71454383,2024-06-30T23:44:06.530Z,"4 km ESE of Tallaboa, Puerto Rico",earthquake,0.25,0.36,0.035377088129387,6,reviewed,pr,pr
```

## Domain `usgs-strict`

### Telos

```
Target record (the FINAL, immutable goal — "telos"):
{
  "event_id":       non-empty string — the USGS event id (GeoJSON "id"; CSV column "id"),
  "magnitude":      number — the event magnitude,
  "magnitude_type": lowercase string, one of: ml, md, mb, mw, mww, mwb, mwc, mwr, ms, mb_lg, mi, mh,
  "latitude":       number in [-90, 90],
  "longitude":      number in [-180, 180],
  "timestamp_utc":  origin time as "YYYY-MM-DDTHH:MM:SSZ" (UTC, milliseconds truncated),
  "place":          non-empty string — the place description verbatim,
  "event_type":     string — the event type verbatim (e.g. "earthquake", "quarry blast", "explosion"),
  "status":         "reviewed" or "automatic",
  "depth_km":       number between 0 and 800 (depth in kilometers),
  "significance":   integer between 0 and 2500
}
Inputs arrive either as a single GeoJSON Feature (JSON string; coordinates are [lon, lat, depth_km],
"time" is epoch milliseconds) or as a single CSV line WITHOUT header in the USGS FDSN column order:
time,latitude,longitude,depth,mag,magType,nst,gap,dmin,rms,net,id,updated,place,type,horizontalError,depthError,magError,magNst,status,locationSource,magSource
(place is double-quoted when it contains commas).
```

### Example inputs (one per format)

```
{"type":"Feature","properties":{"mag":4.3,"place":"241 km SE of Chiniak, Alaska","time":1711929411209,"updated":1717278950040,"tz":null,"url":"https://earthquake.usgs.gov/earthquakes/eventpage/us7000m94h","detail":"https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000m94h&format=geojson","felt":null,"cdi":null,"mmi":1,"alert":null,"status":"reviewed","tsunami":0,"sig":284,"net":"us","code":"7000m94h","ids":",ak02446vxnsz,us7000m94h,","sources":",ak,us,","types":",origin,phase-data,shakemap,","nst":74,"dmin":2.412,"rms":0.65,"gap":192,"magType":"mb","type":"earthquake","title":"M 4.3 - 241 km SE of Chiniak, Alaska"},"geometry":{"type":"Point","coordinates":[-149.6909,55.9718,13.098]},"id":"us7000m94h"}
```

