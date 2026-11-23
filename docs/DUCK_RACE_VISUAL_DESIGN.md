# Duck Race visual design and asset ownership

## Original River Club art

All geometry, shaders, canvas labels and synthesized sounds are authored in this repository.
No model, texture, sound, source or branding was copied from the reference site. The implementation
uses procedural Three.js assets, not downloaded GLBs. There is no external asset-loading dependency.

- Sunny River: turquoise water, meadow banks, layered foliage, flowers/reeds, rocks, fences,
  cottages, clouds, a bridge, grandstands and start/finish gates.
- Tropical River: greener banks, palm silhouettes, rock terraces and animated falling water/spray.
- Night Festival: deep blue water, lantern strings, luminous bridge trim and podium fireworks.

The three worlds reuse the river strip/path and camera director. Lighting, palette and props
are selected by track. Soft directional shadows are optional; color highlights and shore foam
are shader effects rather than ray-traced reflections or a fluid simulation.

## Characters and motion

Twelve multipart ducks: yellow, white, black, ninja, pirate, king, astronaut, cowboy, conical
hat, party, robot and rainbow. Each uses rounded body/head, eyes, beak, separate wings/tail,
with original modeled accessories. This catalog is cosmetic only.

Rigs float, blink and turn; measured movement speed blends body lean, swimming cadence and
wing motion. Finish rank triggers celebration or a brief disappointed pose. Podium rigs dance;
a modeled cup sits on the winner's stand. Reduced motion disables decorative rig/water/particle
animation while essential race positions still advance.

Opaque parts share instance batches and quality-dependent sphere detail. Distant spheres use
lower LOD; only leading and personal labels remain on large fields. Wakes and splashes are
pooled into one or two draws. Shared catalog resources are intentionally bounded and retained;
instance buffers, scene geometry, shader materials and unique labels are disposed on unmount.

## Presentation

Eight camera modes: auto, overview, leader, side, water, aerial, finish and free orbit. Automatic
shots change with race phase; transitions are damped. Seeking/podium switches cut directly to the
new location to avoid flying through scenery. Reduced motion uses a stable overview orientation.

The finish camera looks from the upstream side so the overhead sign does not hide approaching
ducks. Podium labels sit in front of the stands. Confetti and bounded GPU fireworks celebrate
Festival finishes; the background bridge is lowered to preserve the composition.

The viewport takes priority. Rankings can collapse, all camera controls are local, and fullscreen
is available. Photo Finish supplies an exact millisecond gap beside the slow-motion replay.
Mobile defaults to the lightweight 2D race with participation, reactions and results intact.

## Quality and sound settings

LOW/MEDIUM/HIGH control sphere complexity, water detail, shadows and particle density.
Independent controls: resolution 75/100/150/200%, shadows, particles, reduced motion, FPS display,
automatic quality reduction, 2D rendering and game volume/mute. Sustained sub-24 FPS samples
reduce HIGH -> MEDIUM -> LOW when enabled. Desktop defaults to 150% resolution (mobile 100%);
automatic reduction never takes a native-or-higher setting below 100%. The explicit resolution
choice is independent of effects quality, including 200% with LOW effects. No fake post-processing or camera-shake toggle is
shown: there is no bloom pass or intentional camera shake in this implementation.

SFX are original Web Audio oscillators for countdown/start, quack, overtake, sprint, finish and
UI actions. They have a separate context/volume, are initially silent, require a gesture and
never adjust the room's YouTube player. This is synthesized feedback, not a recorded announcer.

## Visual acceptance and limits

Screenshots are captured under `test-results/duck` and inspected manually in this workspace;
see DUCK_RACE_TESTING.md for actual runs. They are review artifacts, not approved pixel-golden
baselines. Remount counters are bounded-scenario evidence, not a long-duration GPU leak proof.

Reference-level visual parity is not claimed. These are stylized procedural assets; no Blender
sculpting, licensed cinematic asset library, true water reflections or post-processing pipeline
was introduced. A user visual review and real hardware/browser soak are release gates.

Reference reviewed earlier (no source/assets copied): https://randomduckrace.com/vi/?mode=multi
R3F resource/performance reference: https://r3f.docs.pmnd.rs/advanced/scaling-performance
