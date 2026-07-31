# Cortex

**Proofread neurons from the MICrONS mouse visual cortex volume, coloured by
their own depth below the pia.**

### [amyleesterling.github.io/microns](https://amyleesterling.github.io/microns/)

One static page. No build step, no framework, nothing fetched from a CDN.

---

## What it is

Every fully proofread neuron I hold from the MICrONS volume, 38 of them, seen
side on with the pia at the top. Colour is not a property of the cell. It is
position: every point on every arbor is tinted by its own depth, so one
pyramidal neuron reads gold where its apical tuft reaches layer 1 and blue where
its soma sits deep. Nothing draws the layers in. They appear because that is
where the cell bodies are.

The render is Blender, from `microns_column.py`: 38 meshes, 53,096,876 faces,
vertex depths spanning 321 to 1074 &micro;m below the pia.

## What is measured

Nothing on this page is typed into the markup. Every figure is computed at load
from the table the render was built from, so the readouts cannot drift away from
the picture they describe.

| | |
|---|---|
| cells | 38 proofread, 34 with a soma on record |
| soma depth | 429 to 910 &micro;m below the pia, median 630 |
| membrane | 809,115 &micro;m&sup2; measured across the 38 |
| synapses | 163,116 incoming, 23,332 outgoing |
| stale identifiers | 9 of 38, resolved forward through the chunked graph |

Sources, all from CAVE on datastack `minnie65_phase3_v1`:

- soma positions and nucleus volumes from `nucleus_detection_v0`, materialization **1853**
- synapse counts from `synapses_pni_2`, materialization **1855**
- predicted cell types from `aibs_metamodel_celltypes_v661`, materialization **1855**

The provenance line under the banner histogram names both materializations,
because quoting one version for figures that came from two is the kind of small
lie that makes the rest of a readout untrustworthy.

There is no cable length here. It is not in any materialized table, and getting
it means skeletonising every mesh, so the readout does without rather than
approximating it.

## The four interactives

Each one fetches nothing until you are near it, and runs no render loop while it
is off screen. Shared plumbing is in [`js/holo3d.js`](js/holo3d.js).

**Two brains, one space** ([`js/brainscale.js`](js/brainscale.js)). A human and a
mouse brain at true relative size, each turned on its own rather than orbited
together. The ratio is 1/12.9, computed from the bounding boxes recorded beside
the meshes. The mouse brain is drawn as glass because the gold V1 marker is the
Allen atlas centroid, a point well inside the surface rather than on it.

**Nine cell types** ([`js/celltypes.js`](js/celltypes.js)). Nine reconstructions
from the same volume, one at a time, each with its real segment id and a link
into Neuroglancer. Two of them are not neurons. The decimated face count is
counted off the geometry after it loads rather than read from the extraction
manifest, which has gone stale for two of the nine.

**One spike, one synapse** ([`js/actionpotential.js`](js/actionpotential.js)).
Two cells re extracted in a frame centred on the synapse where they touch, so
the origin of that scene is a place in a mouse brain. The spark follows the
cells' own skeletons, 2,286 &micro;m of measured neurite, not a line drawn
between them. **The timing is not physics**: no membrane model, no millivolts,
no refractory period. What is measured is the route and the distances.

**Thirty seconds that happened** ([`js/activity.js`](js/activity.js)). 108 cells
at their own coordinates, each brightening on its own recorded two photon calcium
trace, 900 frames at 30 frames a second. A calcium trace is not a spike: it
follows spiking slowly, so a bright cell is one that fired recently. The
reconstructed arbors are available behind a button, Draco compressed from 118 MB
to 13 MB.

## Running it

Any static server from the repository root:

```bash
python -m http.server 3470
```

Three.js 0.184.0 is vendored into [`vendor/`](vendor) rather than pulled from a
CDN, so the page does not stop working because someone else's host went down or
shipped a new major version under the same tag.

## Credits

Data from the **MICrONS Consortium**, served through
[microns-explorer.org](https://www.microns-explorer.org). Meshes, soma
positions, synapses and cell type predictions queried from CAVE.

The functional traces come from the
[cortical mm&sup3; dataset](https://www.microns-explorer.org/cortical-mm3) and
[DANDI 000402](https://dandiarchive.org/dandiset/000402).

The human cortical surface is FreeSurfer pial, left and right hemispheres. The
mouse brain is the **Allen Institute** root compartment, structure 997.

The interactive panels were ported from
[Inner Cosmos](https://amyleesterling.github.io/inner_cosmos/). The banner
readout is also a component in
[scifi-ui](https://amyleesterling.github.io/scifi-ui/components/).

Companion to the [CA3 renderings](https://amyleesterling.github.io/ca3/), which
use the same three colour stops reversed. There the ramp encodes a measured
quantity, how many mossy fibers reach a cell. Here it encodes position in tissue.
Same visual language, two different kinds of fact, and it is worth saying which
is which.
