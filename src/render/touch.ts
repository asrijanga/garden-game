import type * as THREE from 'three';

/**
 * Mark one item of a buffer attribute (an instance's matrix, colour, …) as changed, so only that
 * slice is sent to the GPU rather than the whole buffer. Re-uploading a few-thousand-instance
 * buffer every frame because one stone moved was the single biggest cost on the phone.
 * (Only works if every change to the attribute goes through here: a plain `needsUpdate` with no
 * ranges uploads everything.)
 */
export function touch(attr: THREE.BufferAttribute, index: number) {
  attr.addUpdateRange(index * attr.itemSize, attr.itemSize);
  attr.needsUpdate = true;
}
