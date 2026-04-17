import React, { useRef, useEffect } from "react";
import * as THREE from "three";

const DepthChart3DCanvas = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const IS_MOBILE = window.innerWidth < 768;
    const NUM_BARS = IS_MOBILE ? 8 : 15;
    const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 1.5);

    // Initial setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera simulating ~25 deg grid tilt receding to horizon
    camera.position.set(0, 8, 20);
    camera.lookAt(0, -2, -10);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ 
        antialias: !IS_MOBILE,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false 
      });
      renderer.setPixelRatio(PIXEL_RATIO);
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current.appendChild(renderer.domElement);
    } catch (e) {
      console.warn("WebGL could not be initialized in DepthChart3DCanvas:", e);
      return;
    }

    // Grid (XZ plane)
    const gridSize = 100;
    const gridDivisions = 60;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x2dd4bf, 0x2dd4bf);
    gridHelper.material.opacity = 0.04;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Materials
    const tealMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2dd4bf, 
      roughness: 0.3, 
      metalness: 0.6 
    });
    const amberMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xf59e0b, 
      roughness: 0.3, 
      metalness: 0.6 
    });

    const boxGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
    boxGeo.translate(0, 0.5, 0); // Translate so scaling Y scales up from bottom

    const leftBars: THREE.Mesh[] = [];
    const rightBars: THREE.Mesh[] = [];
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Bar placement
    const spread = 2; // gap in the middle
    const barSpacingX = 1.0;
    const barSpacingZ = 1.0;

    for (let i = 0; i < NUM_BARS; i++) {
        const offsetZ = -i * barSpacingZ;
        
        // Left cluster (Bid)
        const lBar = new THREE.Mesh(boxGeo, tealMaterial);
        lBar.position.set(-spread - (i * barSpacingX), 0, offsetZ);
        lBar.userData = {
          base: 1 + Math.random() * 3,
          variance: 0.5 + Math.random() * 1.5,
          offset: i
        };
        mainGroup.add(lBar);
        leftBars.push(lBar);
  
        // Right cluster (Ask)
        const rBar = new THREE.Mesh(boxGeo, amberMaterial);
        rBar.position.set(spread + (i * barSpacingX), 0, offsetZ);
        rBar.userData = {
          base: 1 + Math.random() * 3,
          variance: 0.5 + Math.random() * 1.5,
          offset: i
        };
        mainGroup.add(rBar);
        rightBars.push(rBar);
    }

    // Center "Spread" line
    const points = [];
    points.push(new THREE.Vector3(0, -0.5, 5));
    points.push(new THREE.Vector3(0, -0.5, -20));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.3 });
    const spreadLine = new THREE.Line(lineGeo, lineMat);
    mainGroup.add(spreadLine);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Animation loop
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Ripple the bars
      leftBars.forEach((bar) => {
        const { base, variance, offset } = bar.userData;
        const h = base + Math.sin(elapsed * 1.2 + offset * 0.4) * variance;
        bar.scale.y = Math.max(0.1, h);
      });
      rightBars.forEach((bar) => {
        const { base, variance, offset } = bar.userData;
        const h = base + Math.sin(elapsed * 1.2 + offset * 0.4) * variance;
        bar.scale.y = Math.max(0.1, h);
      });

      // Subtle Y-axis auto-rotate 0.0003 rad/frame
      mainGroup.rotation.y += 0.0003;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      boxGeo.dispose();
      lineGeo.dispose();
      tealMaterial.dispose();
      amberMaterial.dispose();
      lineMat.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 z-10 pointer-events-none" />;
};

export default DepthChart3DCanvas;
