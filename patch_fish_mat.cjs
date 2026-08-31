const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `    const fishMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.2, metalness: 0.3, vertexColors: true
    });
    this._instancedFishMat = fishMat;
    fishMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      fishMat.userData.shader = shader;
      
      shader.vertexShader = \`
        attribute float aPhase;
        attribute float aSpeed;
        attribute vec3 aColor;
        varying vec3 vInstColor;
        uniform float uTime;
      \` + shader.vertexShader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        \`
        vec3 transformed = vec3( position );
        // The wag increases towards the tail (z < 0)
        float wag = sin(aPhase + uTime * aSpeed * 10.0) * (transformed.z < 0.0 ? -transformed.z * 0.4 : 0.0);
        transformed.x += wag;
        vInstColor = aColor;
        \`
      );

      shader.fragmentShader = \`
        varying vec3 vInstColor;
      \` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        \`
        #include <color_fragment>
        diffuseColor.rgb *= vInstColor;
        \`
      );
    };`;

const replace = `    // Upgraded to Physical material for wet, scaled, realistic look
    const fishMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, 
      roughness: 0.15, 
      metalness: 0.1, 
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      vertexColors: true
    });
    this._instancedFishMat = fishMat;
    fishMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      fishMat.userData.shader = shader;
      
      shader.vertexShader = \`
        attribute float aPhase;
        attribute float aSpeed;
        attribute vec3 aColor;
        varying vec3 vInstColor;
        varying vec3 vLocalPos;
        uniform float uTime;
      \` + shader.vertexShader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        \`
        vec3 transformed = vec3( position );
        vLocalPos = position;
        
        // Fluid, organic wagging motion. The wag starts mid-body and amplifies heavily at the tail.
        float wagFactor = smoothstep(0.5, -1.8, transformed.z);
        float wag = sin(aPhase + uTime * aSpeed * 12.0) * wagFactor * 0.45;
        // subtle secondary wag for the tail tip
        float wag2 = cos(aPhase + uTime * aSpeed * 24.0) * smoothstep(-0.5, -2.0, transformed.z) * 0.15;
        
        transformed.x += wag + wag2;
        vInstColor = aColor;
        \`
      );

      shader.fragmentShader = \`
        varying vec3 vInstColor;
        varying vec3 vLocalPos;
        
        // Simple 2D procedural Voronoi/Scale pattern
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453); }
        
        float scalePattern(vec2 uv) {
            uv *= 18.0; // scale size
            uv.x *= 0.5; // stretch scales horizontally along the body
            vec2 p = floor(uv);
            vec2 f = fract(uv);
            float res = 1.0;
            for(int j=-1; j<=1; j++)
            for(int i=-1; i<=1; i++) {
                vec2 b = vec2(float(i), float(j));
                vec2 r = vec2(b) - f + hash2(p + b) * 0.2 + 0.4;
                float d = dot(r, r);
                res = min(res, d);
            }
            // Invert and curve to make overlapping scale ridges
            return smoothstep(0.1, 0.6, res);
        }
      \` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        \`
        #include <color_fragment>
        diffuseColor.rgb *= vInstColor;
        
        // Procedural Scales & Fin details based on local position
        bool isFin = vColor.r < 0.9 && vColor.g < 0.9 && vColor.b < 0.9;
        bool isEye = vColor.r == 0.0 && vColor.g == 0.0 && vColor.b == 0.0;
        
        if (!isEye && !isFin) {
            // Body scales
            float scales = scalePattern(vec2(vLocalPos.z, vLocalPos.y + vLocalPos.x));
            // Add a subtle metallic iridescence to the scales
            diffuseColor.rgb *= mix(0.7, 1.2, scales);
        } else if (isFin) {
            // Fin striations
            float striation = sin(vLocalPos.x * 60.0 + vLocalPos.z * 40.0) * 0.5 + 0.5;
            diffuseColor.rgb *= mix(0.8, 1.1, striation);
            diffuseColor.a *= 0.85; // slight transparency for fins
        }
        
        // Darken the top (dorsal) and lighten the belly (ventral) for realistic fish shading (Countershading)
        if (!isEye) {
            float counterShade = smoothstep(-0.2, 0.5, vLocalPos.y);
            diffuseColor.rgb *= mix(vec3(0.6), vec3(1.1), counterShade);
        }
        \`
      );
      
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        \`
        #include <normal_fragment_maps>
        // Bump normal map using the procedural scale pattern
        if (!isEye && !isFin) {
            vec2 eps = vec2(0.01, 0.0);
            float s0 = scalePattern(vec2(vLocalPos.z, vLocalPos.y + vLocalPos.x));
            float sX = scalePattern(vec2(vLocalPos.z + eps.x, vLocalPos.y + vLocalPos.x));
            float sY = scalePattern(vec2(vLocalPos.z, vLocalPos.y + vLocalPos.x + eps.x));
            vec3 scaleNormal = normalize(vec3(sX - s0, sY - s0, 0.4));
            
            normal = normalize(normal + scaleNormal * 0.5);
        }
        \`
      );
    };`;

if (!code.includes('const fishMat = new THREE.MeshStandardMaterial({')) {
  console.log('Material definition not found');
} else {
  code = code.replace(search, replace);
  fs.writeFileSync('js/world3d.js', code);
  console.log('Patched material');
}
