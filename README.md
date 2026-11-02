# INK NEXT V38 — Faster model transfer and sharper rendering

This build retains the functional V37 configurator, About/Contact pages, and optional 3D loading. Changes:

- The GLB in `public/models/car.glb` was optimized *only in its 13 opaque metallic/roughness images* (lossy JPEG, max 1024 px). Original mesh/accessor data, nodes, UVs and geometry are kept unchanged. The GLB is now approximately **68.4 MB** rather than **90.3 MB**. Keep your original GLB as a master file elsewhere.
- Low / Balanced / High render pixel ratios raised to .70 / .90 / 1.10 with GPU pixel ceilings 1.0m / 1.65m / 2.2m. This improves visual clarity over V37's .50 / .62 / .76 settings but increases GPU workload. Avoid testing 3D on any device experiencing system black screens.
- MSAA antialiasing enabled when supported, and shader precision is highp. Quality improvements and resource usage vary by GPU.
- Deferred 3D JS loading, frame pacing and model URL remain otherwise unchanged from V37.

Run `npm install`, `npm run dev` (local) or `npm run build` (production).

This does not guarantee an instant first load: the mesh data is still large and the browser must parse and upload it. Future major speedups require mesh simplification / Draco or Meshopt and texture transcoding to KTX2, with visual regression testing.
