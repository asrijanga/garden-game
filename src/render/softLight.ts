import * as THREE from 'three';

/**
 * Soft light, as on a bright cloudy day or by a window. Every lit material shares three.js's
 * Lambert shading, so changing that one piece changes them all at once (before any of them is
 * compiled): the light wraps far round each form instead of falling off sharply, so petals and
 * leaves keep gentle gradients that show their shape and nothing goes hard (the world turns the
 * sun down and the sky up to match).
 */
export function useSoftLight() {
  THREE.ShaderChunk.lights_lambert_pars_fragment = /* glsl */ `
varying vec3 vViewPosition;

struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};

void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  float wrap = saturate( ( dotNL + 0.55 ) / 1.55 );
  vec3 irradiance = wrap * wrap * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert
`;
}
