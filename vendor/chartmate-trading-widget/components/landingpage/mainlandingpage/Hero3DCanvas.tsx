import React, { useEffect, useRef } from 'react';

const Hero3DCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let animationFrameId: number;
    let renderer: any, scene: any, camera: any;
    let particlesMesh: any, orbMesh: any;

    const initThree = async () => {
      const THREE = await import('three');
      if (!mounted || !mountRef.current) return;

      // 1. Scene Setup
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 5;

      try {
        renderer = new THREE.WebGLRenderer({ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);
      } catch (e) {
        console.warn("WebGL could not be initialized in Hero3DCanvas:", e);
        return;
      }

      // 2. Particle Field (~1200 dots, rotating grid/mesh)
      const isMobile = window.innerWidth < 768;
      const particleCount = isMobile ? 400 : 1200;
      const particlesGeo = new THREE.BufferGeometry();
      const posArray = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount * 3; i++) {
        // Spread particles across a wide area
        posArray[i] = (Math.random() - 0.5) * 15;
      }
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      
      const particlesMaterial = new THREE.PointsMaterial({
        size: 0.02,
        color: 0x14b8a6,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
      });
      
      particlesMesh = new THREE.Points(particlesGeo, particlesMaterial);
      scene.add(particlesMesh);

      // 3. Floating 3D Orb (Icosahedron wireframe)
      const orbGeo = new THREE.IcosahedronGeometry(2, 1);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0x14b8a6,
        wireframe: true,
        transparent: true,
        opacity: 0.3
      });
      orbMesh = new THREE.Mesh(orbGeo, orbMat);
      scene.add(orbMesh);

      // Add a light for the material
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      scene.add(ambientLight);

      // 4. Mouse Parallax Setup
      let mouseX = 0;
      let mouseY = 0;
      let targetX = 0;
      let targetY = 0;

      const handleMouseMove = (event: MouseEvent) => {
        if (isMobile) return;
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
      };

      if (!isMobile) {
        window.addEventListener('mousemove', handleMouseMove);
      }

      // 5. Animation Loop
      const clock = new THREE.Clock();

      const animate = () => {
        if (!mounted) return;
        animationFrameId = requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();

        // Rotate particles slowly
        particlesMesh.rotation.y = elapsedTime * 0.05;
        particlesMesh.rotation.x = elapsedTime * 0.02;

        // Rotate orb and pulse scale
        orbMesh.rotation.y = elapsedTime * 0.2;
        orbMesh.rotation.x = elapsedTime * 0.1;
        
        const scale = Math.sin(elapsedTime * 0.5) * 0.05 + 1;
        orbMesh.scale.set(scale, scale, scale);

        // Camera Parallax with lerp (max 3-5 deg effect)
        if (!isMobile) {
          targetX = mouseX * 0.5;
          targetY = mouseY * 0.5;
          camera.position.x += (targetX - camera.position.x) * 0.05;
          camera.position.y += (targetY - camera.position.y) * 0.05;
          camera.lookAt(scene.position);
        }

        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize);

      // Cleanup function specific to Three.js objects
      return () => {
        window.removeEventListener('resize', handleResize);
        if (!isMobile) {
          window.removeEventListener('mousemove', handleMouseMove);
        }
        if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
        particlesGeo.dispose();
        particlesMaterial.dispose();
        orbGeo.dispose();
        orbMat.dispose();
        renderer.dispose();
      };
    };

    let cleanupThree: (() => void) | void;
    initThree().then(cleanup => {
      cleanupThree = cleanup;
    });

    return () => {
      mounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (cleanupThree) cleanupThree();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 z-10 pointer-events-none" />;
};

export default Hero3DCanvas;
