import * as THREE from "three";

export class HexCell extends THREE.Mesh {

    constructor() {
        const geometry = new THREE.PlaneGeometry(10, 10)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: false})
        super(geometry, material);
        this.rotateX(-Math.PI/2)
    }
}