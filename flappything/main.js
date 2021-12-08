import './style.css'

import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'





const scene = new THREE.Scene();


const camera = new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight, 0.1, 1000 )

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#bg')
})

renderer.setPixelRatio( window.devicePixelRatio)
renderer.setSize( window.innerWidth, window.innerHeight)
camera.position.setZ(44);//sizing

renderer.render(scene, camera);

const geometry = new THREE.SphereGeometry(10,1,16,100000)
const material = new THREE.MeshStandardMaterial({color: 0x000000});
const torus = new THREE.Mesh(geometry, material);

scene.add(torus)

const geometry2 = new THREE.SphereGeometry(10,1,16,10000)
const material2 = new THREE.MeshStandardMaterial({color: 0x080808});
const torus2 = new THREE.Mesh(geometry2, material2);

scene.add(torus2)

const geometry1 = new THREE.SphereGeometry(10,1,16,1000)
const material1 = new THREE.MeshStandardMaterial({color: 0x101010});
const torus1 = new THREE.Mesh(geometry1, material1);

scene.add(torus1)

const geometry0 = new THREE.SphereGeometry(10,1,16,-1000)
const material0 = new THREE.MeshStandardMaterial({color: 0x181818});
const torus0 = new THREE.Mesh(geometry0, material0);

scene.add(torus0)

const pointLight = new THREE.PointLight(0xffffff)
pointLight.position.set(0,0,0)

const ambientLight = new THREE.AmbientLight(0xffffff)
scene.add(pointLight, ambientLight)

const lightHelper = new THREE.PointLightHelper(pointLight)
//const gridHelper = new THREE.GridHelper(200,50)
//scene.add(lightHelper)//, gridHelper)

const controls = new OrbitControls(camera, renderer.domElement)

function addStar() {
  const geometry = new THREE.SphereGeometry(.25, 40, 2.4)
  const material = new THREE.MeshStandardMaterial({color: 0xffffff})
  const star = new THREE.Mesh(geometry, material);

  const [x,y,z] = Array(3).fill().map(() => THREE.MathUtils.randFloatSpread( 500*2 ) );

  star.position.set(x,y,z);

  scene.add(star)

}
Array(10100*2 ).fill().forEach(addStar)


var text2 = document.createElement('div');
text2.style.position = 'absolute';
//text2.style.zIndex = 1;    // if still don't see the label, try uncommenting this
text2.style.width = 100;
text2.style.height = 100;
text2.style.color = 'white';
//text2.style.backgroundColor = "black";
text2.innerHTML = "Hi there!";
text2.style.top = 200 + 'px';
text2.style.left = 200 + 'px';
document.body.appendChild(text2);





//const spaceTexture = new THREE.TextureLoader().load('space.jpg');
//scene.background = spaceTexture

// Avatar

const armTexture = new THREE.TextureLoader().load('arm.png')

const arm = new THREE.Mesh(
  new THREE.BoxGeometry(3,3,3),
  new THREE.MeshBasicMaterial( { map: armTexture } )
);

//scene.add(arm)


function animate() {
  requestAnimationFrame( animate);

  torus.rotation.x += 0.01;
  torus.rotation.y += 0.005;
  torus.rotation.z += 0.01;

  torus2.rotation.x += 0.011;
  torus2.rotation.y += 0.0051;
  torus2.rotation.z += 0.011;

  torus1.rotation.x += 0.012;
  torus1.rotation.y += 0.0052;
  torus1.rotation.z += 0.012;

  torus0.rotation.x += 0.013;
  torus0.rotation.y += 0.0053;
  torus0.rotation.z += 0.013;


  controls.update();

  renderer.render( scene, camera);
}

animate()

