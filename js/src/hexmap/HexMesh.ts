import * as THREE from "three";
import {HexMetrics} from "./HexMetrics";
import {BufferGeometryUtils} from "../lib/BufferGeometryUtils";
import {ListPool} from "./ListPool";

export class HexMesh extends THREE.Mesh {

    meshVertices!: Array<number>;
    meshTriangles!: Array<number>;
    meshColors!: Array<number>;

    static verticesPool = new ListPool<number>();
    static trianglesPool = new ListPool<number>();
    static colorsPool = new ListPool<number>();

    readonly wireframeCopy: THREE.Mesh;

    constructor(material: THREE.Material, wireframeMaterial: THREE.Material, showWireframe: boolean = true) {
        const geometry = new THREE.BufferGeometry();
        material.side = THREE.BackSide;
        super(geometry, material);
        this.name = "Hex mesh";

        this.wireframeCopy = new THREE.Mesh(geometry, wireframeMaterial);
        this.add(this.wireframeCopy);
        this.wireframeCopy.name = "Wireframe mesh copy";
        this.wireframeCopy.visible = showWireframe;
    }

    clearAll() {
        this.meshVertices = HexMesh.verticesPool.get();
        this.meshTriangles = HexMesh.trianglesPool.get();
        this.meshColors = HexMesh.colorsPool.get();
    }

    apply() {
        const meshGeometry = new THREE.BufferGeometry();

        meshGeometry.setIndex(this.meshTriangles);
        HexMesh.trianglesPool.add(this.meshTriangles);

        BufferGeometryUtils.setPosition(meshGeometry, this.meshVertices);
        HexMesh.verticesPool.add(this.meshVertices);

        BufferGeometryUtils.setColor(meshGeometry, this.meshColors);
        HexMesh.colorsPool.add(this.meshColors);

        meshGeometry.computeVertexNormals();
        this.geometry = meshGeometry;
        this.wireframeCopy.geometry = meshGeometry;
    }

    addTriangleColor(c1: THREE.Color, c2: THREE.Color, c3: THREE.Color) {
        this.addColor(c1);
        this.addColor(c2);
        this.addColor(c3);
    }

    addTriangleColorSingle(color: THREE.Color) {
        this.addTriangleColor(color, color, color);
    }

    addTriangle(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3) {
        const vertexIndex = this.meshVertices.length / 3;
        this.addVertices(HexMetrics.perturb(v1), HexMetrics.perturb(v2), HexMetrics.perturb(v3));
        this.meshTriangles.push(vertexIndex);
        this.meshTriangles.push(vertexIndex + 1);
        this.meshTriangles.push(vertexIndex + 2);
    }

    addTriangleUnperturbed(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3) {
        const vertexIndex = this.meshVertices.length / 3;
        this.addVertices(v1, v2, v3);
        this.meshTriangles.push(vertexIndex);
        this.meshTriangles.push(vertexIndex + 1);
        this.meshTriangles.push(vertexIndex + 2);
    }

    addQuad(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, v4: THREE.Vector3) {
        const vertexIndex = this.meshVertices.length / 3;
        this.addVertices(HexMetrics.perturb(v1), HexMetrics.perturb(v2), HexMetrics.perturb(v3), HexMetrics.perturb(v4));
        this.meshTriangles.push(vertexIndex);
        this.meshTriangles.push(vertexIndex + 2);
        this.meshTriangles.push(vertexIndex + 1);
        this.meshTriangles.push(vertexIndex + 1);
        this.meshTriangles.push(vertexIndex + 2);
        this.meshTriangles.push(vertexIndex + 3);
    }

    addQuadColor4v(c1: THREE.Color, c2: THREE.Color, c3: THREE.Color, c4: THREE.Color) {
        this.addColor(c1);
        this.addColor(c2);
        this.addColor(c3);
        this.addColor(c4);
    }

    addQuadColor1v(c: THREE.Color) {
        this.addQuadColor2v(c, c);
    }

    addQuadColor2v(c1: THREE.Color, c2: THREE.Color) {
        this.addQuadColor4v(c1, c1, c2, c2);
    }

    addColor(color1: THREE.Color) {
        this.meshColors.push(color1.r, color1.g, color1.b);
    }

    addVertex(v: THREE.Vector3) {
        this.meshVertices.push(v.x, v.y, v.z);
    }

    addVertices(...vertices: Array<THREE.Vector3>) {
        vertices.forEach(v => this.addVertex(v));
    }
}