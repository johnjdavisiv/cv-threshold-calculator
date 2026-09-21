# Calculate threshold, CV, and VO2max paces

>By John J. Davis

Front-end UI and back-end calculations for estimating "threshold pace" (a.k.a. SSmax or maximal metabolic steady-state), "CV pace" (a.k.a. critical speed), and "VO2max pace" (a.k.a. vVO2max or slowest metabolically unsustainable pace) from race performances from 800m-10k. Provides best estimates and uncertainty ranges.  

These estimates are based on critical speed calculations applied to data from over 600,000 race performances from high school, junior-college, and college athletes (v2.0, September 2026). The fitted model ships as `cv_pieces_v2026-09-05.json` (exact piecewise-bicubic pieces of the spline surfaces plus the data hull); `tests/check_model.mjs` checks the app's evaluator against `cv_goldens_v2026-09-05.json`, 429 cases computed with R's `predict()`.  

[See the live app here](https://apps.runningwritings.com/cv-threshold-calculator/)

## Build and deploy

```
npm run build      # stamps this app's own css/js with today's date, then assembles dist/ (exactly the upload set)
```

Deploy = upload the contents of `dist/` to the SiteGround path the build prints. The build fails if a referenced asset is missing, if a page points at a file that is not in `dist/`, or if a `?v=dev` stamp is left. `tools/build-dist.mjs` and `tools/stamp.mjs` are byte-identical across the RW web apps; this app's file list is `rwBuild` in `package.json`.
