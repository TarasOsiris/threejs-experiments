import {HexCell} from "./HexCell";
import {HexMesh} from "./HexMesh";
import {HexMetrics} from "./HexMetrics";
import {HexDirection, HexDirectionUtils} from "./HexDirection";
import {EdgeVertices} from "./EdgeVertices";
import {Vec3} from "../lib/math/Vec3";
import {HexEdgeType} from "./HexEdgeType";
import {HexMaterials} from "./util/HexMaterials";
import {Color, Object3D, Vector2, Vector3} from "three";

export class HexGridChunk extends Object3D {
    readonly cells: Array<HexCell> = [];

    terrain: HexMesh;
    rivers: HexMesh;
    roads: HexMesh;
    dirty = true;

    constructor() {
        super();
        this.terrain = new HexMesh(HexMaterials.terrainMaterial, HexMaterials.wireframeMaterial, true, true, false);
        // TODO fix shadows on the whole map!
        this.terrain.castShadow = true;
        this.terrain.receiveShadow = true;
        this.rivers = new HexMesh(HexMaterials.riverShaderMaterial, HexMaterials.wireframeMaterial, false, false, true);
        this.rivers.wireframeCopy.visible = false; // TODO to inspector
        this.roads = new HexMesh(HexMaterials.roadShaderMaterial, HexMaterials.wireframeMaterial, false, false, true);
        this.rivers.wireframeCopy.visible = true; // TODO to inspector
        this.add(this.terrain);
        this.add(this.rivers);
        this.add(this.roads);
        this.cells = new Array<HexCell>(HexMetrics.chunkSizeX * HexMetrics.chunkSizeZ);
    }

    refresh() {
        this.terrain.clearAll();
        this.rivers.clearAll();
        this.roads.clearAll();
        this.triangulate(this.cells);
        this.terrain.apply();
        this.rivers.apply();
        this.roads.apply();
        this.dirty = false;
    }

    markDirty() {
        this.dirty = true;
    }

    addCell(index: number, cell: HexCell) {
        this.cells[index] = cell;
        cell.chunk = this;
        this.add(cell, cell.textMesh);
    }

    triangulate(cells: Array<HexCell>) {
        for (let i = 0; i < cells.length; i++) {
            this.triangulateCell(cells[i]);
        }
    }

    triangulateCell(cell: HexCell) {
        for (let d = HexDirection.NE; d <= HexDirection.NW; d++) {
            this.triangulateSector(d, cell);
        }
    }

    private triangulateSector(direction: HexDirection, cell: HexCell) {
        const center = cell.cellPosition.clone();
        const e = new EdgeVertices(
            Vec3.add(center, HexMetrics.getFirstSolidCorner(direction)),
            Vec3.add(center, HexMetrics.getSecondSolidCorner(direction))
        );

        if (cell.hasRiver) {
            if (cell.hasRiverThroughEdge(direction)) {
                e.v3.y = cell.streamBedY;
                if (cell.hasRiverBeginOrEnd) {
                    this.triangulateWithRiverBeginOrEnd(cell, center, e);
                } else {
                    this.triangulateWithRiver(direction, cell, center, e);
                }
            } else {
                this.triangulateAdjacentToRiver(direction, cell, center, e);
            }
        } else {
            this.triangulateWithoutRiver(direction, cell, center, e);
        }

        if (direction <= HexDirection.SE) {
            const neighbor = cell.getNeighbor(direction);
            if (neighbor == null) {
                return;
            }
            this.triangulateConnection(direction, cell, e);
        }
    }

    private triangulateWithoutRiver(direction: HexDirection, cell: HexCell, center: Vector3, e: EdgeVertices) {
        this.triangulateEdgeFan(center, e, cell.color.clone());
        if (cell.hasRoads) {
            this.triangulateRoad(center,
                Vec3.lerp(center, e.v1, 0.5),
                Vec3.lerp(center, e.v5, 0.5),
                e, cell.hasRoadThroughEdge(direction)
            );
        }
    }

    private triangulateEdgeFan(center: Vector3, edge: EdgeVertices, color: Color) {
        this.terrain.addTriangle(center, edge.v1, edge.v2);
        this.terrain.addTriangleColorSingle(color);
        this.terrain.addTriangle(center, edge.v2, edge.v3);
        this.terrain.addTriangleColorSingle(color);
        this.terrain.addTriangle(center, edge.v3, edge.v4);
        this.terrain.addTriangleColorSingle(color);
        this.terrain.addTriangle(center, edge.v4, edge.v5);
        this.terrain.addTriangleColorSingle(color);
    }

    triangulateEdgeStrip(
        e1: EdgeVertices, c1: Color,
        e2: EdgeVertices, c2: Color,
        hasRoad: boolean = false
    ) {
        this.terrain.addQuad(e1.v1, e1.v2, e2.v1, e2.v2);
        this.terrain.addQuadColor2v(c1, c2);
        this.terrain.addQuad(e1.v2, e1.v3, e2.v2, e2.v3);
        this.terrain.addQuadColor2v(c1, c2);
        this.terrain.addQuad(e1.v3, e1.v4, e2.v3, e2.v4);
        this.terrain.addQuadColor2v(c1, c2);
        this.terrain.addQuad(e1.v4, e1.v5, e2.v4, e2.v5);
        this.terrain.addQuadColor2v(c1, c2);

        if (hasRoad) {
            this.triangulateRoadSegment(e1.v2, e1.v3, e1.v4, e2.v2, e2.v3, e2.v4);
        }
    }

    private triangulateConnection(direction: HexDirection, cell: HexCell, e1: EdgeVertices) {
        const neighbor = cell.getNeighbor(direction) ?? cell;

        const bridge = HexMetrics.getBridge(direction);
        bridge.y = neighbor.position.y - cell.position.y;
        const e2 = new EdgeVertices(
            Vec3.add(e1.v1, bridge),
            Vec3.add(e1.v5, bridge)
        );

        if (cell.hasRiverThroughEdge(direction)) {
            e2.v3.y = neighbor.streamBedY;
            this.triangulateRiverQuad(e1.v2, e1.v4, e2.v2, e2.v4,
                cell.riverSurfaceY, neighbor.riverSurfaceY, 0.8,
                cell.hasIncomingRiver && cell.incomingRiver == direction
            );
        }

        if (cell.getEdgeType(direction) == HexEdgeType.Slope) {
            this.triangulateEdgeTerraces(e1, cell, e2, neighbor, cell.hasRoadThroughEdge(direction));
        } else {
            this.triangulateEdgeStrip(e1, cell.color, e2, neighbor.color, cell.hasRoadThroughEdge(direction));
        }

        const nextDirection = HexDirectionUtils.next(direction);
        const nextNeighbor = cell.getNeighbor(nextDirection);
        if (direction <= HexDirection.E && nextNeighbor != null) {
            const v5 = Vec3.add(e1.v5, HexMetrics.getBridge(nextDirection));
            v5.y = nextNeighbor.cellPosition.y;

            if (cell.elevation <= neighbor.elevation) {
                if (cell.elevation <= nextNeighbor.elevation) {
                    this.triangulateCorner(e1.v5, cell, e2.v5, neighbor, v5, nextNeighbor);
                } else {
                    this.triangulateCorner(v5, nextNeighbor, e1.v5, cell, e2.v5, neighbor);
                }
            } else if (neighbor.elevation <= nextNeighbor.elevation) {
                this.triangulateCorner(e2.v5, neighbor, v5, nextNeighbor, e1.v5, cell);
            } else {
                this.triangulateCorner(v5, nextNeighbor, e1.v5, cell, e2.v5, neighbor);
            }
        }
    }

    triangulateCorner(bottom: Vector3, bottomCell: HexCell,
                      left: Vector3, leftCell: HexCell,
                      right: Vector3, rightCell: HexCell) {
        const leftEdgeType = bottomCell.getEdgeTypeWithOtherCell(leftCell);
        const rightEdgeType = bottomCell.getEdgeTypeWithOtherCell(rightCell);

        if (leftEdgeType == HexEdgeType.Slope) {
            if (rightEdgeType == HexEdgeType.Slope) {
                this.triangulateCornerTerraces(bottom, bottomCell, left, leftCell, right, rightCell);
            } else if (rightEdgeType == HexEdgeType.Flat) {
                this.triangulateCornerTerraces(left, leftCell, right, rightCell, bottom, bottomCell);
            } else {
                this.triangulateCornerTerracesCliff(bottom, bottomCell, left, leftCell, right, rightCell);
            }
        } else if (rightEdgeType == HexEdgeType.Slope) {
            if (leftEdgeType == HexEdgeType.Flat) {
                this.triangulateCornerTerraces(right, rightCell, bottom, bottomCell, left, leftCell);
            } else {
                this.triangulateCornerCliffTerraces(bottom, bottomCell, left, leftCell, right, rightCell);
            }
        } else if (leftCell.getEdgeTypeWithOtherCell(rightCell) == HexEdgeType.Slope) {
            if (leftCell.elevation < rightCell.elevation) {
                this.triangulateCornerCliffTerraces(right, rightCell, bottom, bottomCell, left, leftCell);
            } else {
                this.triangulateCornerTerracesCliff(left, leftCell, right, rightCell, bottom, bottomCell);
            }
        } else {
            this.terrain.addTriangle(bottom, left, right);
            this.terrain.addTriangleColor(bottomCell.color, leftCell.color, rightCell.color);
        }
    }

    triangulateCornerTerraces(
        begin: Vector3, beginCell: HexCell,
        left: Vector3, leftCell: HexCell,
        right: Vector3, rightCell: HexCell
    ) {
        let v3 = HexMetrics.terraceLerp(begin, left, 1);
        let v4 = HexMetrics.terraceLerp(begin, right, 1);
        let c3 = HexMetrics.terraceLerpColor(beginCell.color, leftCell.color, 1);
        let c4 = HexMetrics.terraceLerpColor(beginCell.color, rightCell.color, 1);

        this.terrain.addTriangle(begin, v3, v4);
        this.terrain.addTriangleColor(beginCell.color, c3, c4);

        for (let i = 2; i < HexMetrics.terraceSteps; i++) {
            const v1 = v3;
            const v2 = v4;
            const c1 = c3;
            const c2 = c4;
            v3 = HexMetrics.terraceLerp(begin, left, i);
            v4 = HexMetrics.terraceLerp(begin, right, i);
            c3 = HexMetrics.terraceLerpColor(beginCell.color, leftCell.color, i);
            c4 = HexMetrics.terraceLerpColor(beginCell.color, rightCell.color, i);
            this.terrain.addQuad(v1, v2, v3, v4);
            this.terrain.addQuadColor4v(c1, c2, c3, c4);
        }

        this.terrain.addQuad(v3, v4, left, right);
        this.terrain.addQuadColor4v(c3, c4, leftCell.color, rightCell.color);
    }

    triangulateCornerTerracesCliff(
        begin: Vector3, beginCell: HexCell,
        left: Vector3, leftCell: HexCell,
        right: Vector3, rightCell: HexCell
    ) {
        let b = 1 / (rightCell.elevation - beginCell.elevation);
        if (b < 0) {
            b = -b;
        }

        const boundary = HexMetrics.perturb(begin).lerp(HexMetrics.perturb(right), b);
        const boundaryColor = new Color().copy(beginCell.color).lerp(rightCell.color, b);

        this.triangulateBoundaryTriangle(begin, beginCell, left, leftCell, boundary, boundaryColor);

        if (leftCell.getEdgeTypeWithOtherCell(rightCell) == HexEdgeType.Slope) {
            this.triangulateBoundaryTriangle(left, leftCell, right, rightCell, boundary, boundaryColor);
        } else {
            this.terrain.addTriangleUnperturbed(HexMetrics.perturb(left), HexMetrics.perturb(right), boundary);
            this.terrain.addTriangleColor(leftCell.color, rightCell.color, boundaryColor);
        }
    }

    triangulateCornerCliffTerraces(
        begin: Vector3, beginCell: HexCell,
        left: Vector3, leftCell: HexCell,
        right: Vector3, rightCell: HexCell
    ) {
        let b = 1 / (leftCell.elevation - beginCell.elevation);
        if (b < 0) {
            b = -b;
        }
        const boundary = new Vector3().copy(HexMetrics.perturb(begin))
            .lerp(HexMetrics.perturb(left), b);
        const boundaryColor = new Color().copy(beginCell.color).lerp(leftCell.color, b);

        this.triangulateBoundaryTriangle(right, rightCell, begin, beginCell, boundary, boundaryColor);

        if (leftCell.getEdgeTypeWithOtherCell(rightCell) == HexEdgeType.Slope) {
            this.triangulateBoundaryTriangle(left, leftCell, right, rightCell, boundary, boundaryColor);
        } else {
            this.terrain.addTriangleUnperturbed(HexMetrics.perturb(left), HexMetrics.perturb(right), boundary);
            this.terrain.addTriangleColor(leftCell.color, rightCell.color, boundaryColor);
        }
    }

    private triangulateBoundaryTriangle(begin: Vector3, beginCell: HexCell,
                                        left: Vector3, leftCell: HexCell,
                                        boundary: Vector3, boundaryColor: Color) {
        let v2 = HexMetrics.perturb(HexMetrics.terraceLerp(begin, left, 1));
        let c2 = HexMetrics.terraceLerpColor(beginCell.color, leftCell.color, 1);

        this.terrain.addTriangleUnperturbed(HexMetrics.perturb(begin), v2, boundary);
        this.terrain.addTriangleColor(beginCell.color, c2, boundaryColor);

        for (let i = 2; i < HexMetrics.terraceSteps; i++) {
            const v1 = v2;
            const c1 = c2;
            v2 = HexMetrics.perturb(HexMetrics.terraceLerp(begin, left, i));
            c2 = HexMetrics.terraceLerpColor(beginCell.color, leftCell.color, i);
            this.terrain.addTriangleUnperturbed(v1, v2, boundary);
            this.terrain.addTriangleColor(c1, c2, boundaryColor);
        }

        this.terrain.addTriangleUnperturbed(v2, HexMetrics.perturb(left), boundary);
        this.terrain.addTriangleColor(c2, leftCell.color, boundaryColor);
    }

    triangulateEdgeTerraces(begin: EdgeVertices, beginCell: HexCell,
                            end: EdgeVertices, endCell: HexCell, hasRoad: boolean) {
        let e2 = EdgeVertices.terraceLerp(begin, end, 1);
        let c2 = HexMetrics.terraceLerpColor(beginCell.color, endCell.color, 1);

        this.triangulateEdgeStrip(begin, beginCell.color, e2, c2, hasRoad);

        for (let i = 2; i < HexMetrics.terraceSteps; i++) {
            const e1 = e2.clone();
            const c1 = c2;
            e2 = EdgeVertices.terraceLerp(begin, end, i);
            c2 = HexMetrics.terraceLerpColor(beginCell.color, endCell.color, i);
            this.triangulateEdgeStrip(e1, c1, e2, c2, hasRoad);
        }

        this.triangulateEdgeStrip(e2, c2, end, endCell.color, hasRoad);
    }

    private triangulateWithRiver(direction: HexDirection, cell: HexCell, center: Vector3, e: EdgeVertices) {
        let centerL: Vector3;
        let centerR: Vector3;
        if (cell.hasRiverThroughEdge(HexDirectionUtils.opposite(direction))) {
            const offsetL = HexMetrics.getFirstSolidCorner(HexDirectionUtils.previous(direction)).multiplyScalar(0.25);
            centerL = Vec3.add(center, offsetL);
            const offsetR = HexMetrics.getSecondSolidCorner(HexDirectionUtils.next(direction)).multiplyScalar(0.25);
            centerR = Vec3.add(center, offsetR);
        } else if (cell.hasRiverThroughEdge(HexDirectionUtils.next(direction))) {
            centerL = center;
            centerR = Vec3.lerp(center, e.v5, 2 / 3);
        } else if (cell.hasRiverThroughEdge(HexDirectionUtils.previous(direction))) {
            centerL = Vec3.lerp(center, e.v1, 2 / 3);
            centerR = center;
        } else if (cell.hasRiverThroughEdge(HexDirectionUtils.next2(direction))) {
            centerL = center;
            const offsetR = HexMetrics.getSolidEdgeMiddle(HexDirectionUtils.next(direction)).multiplyScalar(0.5 * HexMetrics.innerToOuter);
            centerR = Vec3.add(center, offsetR);
        } else {
            const offsetL = HexMetrics.getSolidEdgeMiddle(HexDirectionUtils.previous(direction)).multiplyScalar(0.5 * HexMetrics.innerToOuter);
            centerL = Vec3.add(center, offsetL);
            centerR = center;
        }
        center = Vec3.lerp(centerL, centerR, 0.5);
        const m = new EdgeVertices(
            Vec3.lerp(centerL, e.v1, 0.5),
            Vec3.lerp(centerR, e.v5, 0.5),
            1 / 6
        );
        m.v3.y = center.y = e.v3.y;

        this.triangulateEdgeStrip(m, cell.color, e, cell.color);

        this.terrain.addTriangle(centerL, m.v1, m.v2);
        this.terrain.addTriangleColorSingle(cell.color);

        this.terrain.addQuad(centerL, center, m.v2, m.v3);
        this.terrain.addQuadColor1v(cell.color);
        this.terrain.addQuad(center, centerR, m.v3, m.v4);
        this.terrain.addQuadColor1v(cell.color);

        this.terrain.addTriangle(centerR, m.v4, m.v5);
        this.terrain.addTriangleColorSingle(cell.color);

        const reversed = cell.incomingRiver == direction;
        this.triangulateRiverQuadSameY(centerL, centerR, m.v2, m.v4, cell.riverSurfaceY, 0.4, reversed);
        this.triangulateRiverQuadSameY(m.v2, m.v4, e.v2, e.v4, cell.riverSurfaceY, 0.6, reversed);
    }

    private triangulateWithRiverBeginOrEnd(cell: HexCell, center: Vector3, e: EdgeVertices) {
        const m = new EdgeVertices(
            Vec3.lerp(center, e.v1, 0.5),
            Vec3.lerp(center, e.v5, 0.5),
        );

        m.v3.y = e.v3.y;

        this.triangulateEdgeStrip(m, cell.color, e, cell.color);
        this.triangulateEdgeFan(center, m, cell.color);

        const reversed = cell.hasIncomingRiver;
        this.triangulateRiverQuadSameY(m.v2, m.v4, e.v2, e.v4, cell.riverSurfaceY, 0.6, reversed);

        center.y = m.v2.y = m.v4.y = cell.riverSurfaceY;
        this.rivers.addTriangle(center, m.v2, m.v4);
        if (reversed) {
            this.rivers.addTriangleUV(
                new Vector2(0.5, 0.4), new Vector2(1, 0.2), new Vector2(0, 0.2)
            );
        } else {
            this.rivers.addTriangleUV(
                new Vector2(0.5, 0.4), new Vector2(0, 0.6), new Vector2(1, 0.6)
            );
        }
    }

    private triangulateAdjacentToRiver(direction: HexDirection, cell: HexCell, center: Vector3, e: EdgeVertices) {
        if (cell.hasRiverThroughEdge(HexDirectionUtils.next(direction))) {
            if (cell.hasRiverThroughEdge(HexDirectionUtils.previous(direction))) {
                const centerOffset = HexMetrics.getSolidEdgeMiddle(direction).multiplyScalar(HexMetrics.innerToOuter * 0.5);
                center = Vec3.add(center, centerOffset);
            } else if (cell.hasRiverThroughEdge(HexDirectionUtils.previous2(direction))) {
                const centerOffset = HexMetrics.getFirstSolidCorner(direction).multiplyScalar(0.25);
                center = Vec3.add(center, centerOffset);
            }
        } else if (cell.hasRiverThroughEdge(HexDirectionUtils.previous(direction)) && cell.hasRiverThroughEdge(HexDirectionUtils.next2(direction))) {
            const centerOffset = HexMetrics.getSecondSolidCorner(direction).multiplyScalar(0.25);
            center = Vec3.add(center, centerOffset);
        }
        const m = new EdgeVertices(
            Vec3.lerp(center, e.v1, 0.5),
            Vec3.lerp(center, e.v5, 0.5)
        );

        this.triangulateEdgeStrip(m, cell.color, e, cell.color);
        this.triangulateEdgeFan(center, m, cell.color);
    }

    showWireframe(show: boolean) {
        this.terrain.wireframeCopy.visible = show;
    }

    triangulateRiverQuad(v1: Vector3, v2: Vector3, v3: Vector3, v4: Vector3,
                         y1: number, y2: number, v: number, reversed: boolean) {
        v1 = v1.clone();
        v2 = v2.clone();
        v3 = v3.clone();
        v4 = v4.clone();

        v1.y = v2.y = y1;
        v3.y = v4.y = y2;
        this.rivers.addQuad(v1, v2, v3, v4);
        if (reversed) {
            this.rivers.addQuadUVNumbers(1, 0, 0.8 - v, 0.6 - v);
        } else {
            this.rivers.addQuadUVNumbers(0, 1, v, v + 0.2);
        }
    }

    triangulateRiverQuadSameY(v1: Vector3, v2: Vector3, v3: Vector3, v4: Vector3,
                              y: number, v: number, reversed: boolean) {
        this.triangulateRiverQuad(v1, v2, v3, v4, y, y, v, reversed);
    }

    triangulateRoadSegment(
        v1: Vector3, v2: Vector3, v3: Vector3,
        v4: Vector3, v5: Vector3, v6: Vector3,
    ) {
        this.roads.addQuad(v1, v2, v4, v5);
        this.roads.addQuad(v2, v3, v5, v6);
        this.roads.addQuadUVNumbers(0, 1, 0, 0);
        this.roads.addQuadUVNumbers(1, 0, 0, 0);
    }

    triangulateRoad(center: Vector3, mL: Vector3, mR: Vector3, e: EdgeVertices, hasRoadThroughEdge: boolean) {
        if (hasRoadThroughEdge) {
            center = center.clone();
            const mC = Vec3.lerp(mL, mR, 0.5);
            this.triangulateRoadSegment(mL, mC, mR, e.v2, e.v3, e.v4);
            this.roads.addTriangle(center, mL, mC);
            this.roads.addTriangle(center, mC, mR);
            this.roads.addTriangleUV(new Vector2(1, 0), new Vector2(0, 0), new Vector2(1, 0));
            this.roads.addTriangleUV(new Vector2(1, 0), new Vector2(1, 0), new Vector2(0, 0));
        } else {
            this.triangulateRoadEdge(center, mL, mR);
        }
    }

    triangulateRoadEdge(center: Vector3, mL: Vector3, mR: Vector3) {
        this.roads.addTriangle(center, mL, mR);
        this.roads.addTriangleUV(
            new Vector2(1, 0), new Vector2(0, 0), new Vector2(0, 0)
        );
    }
}
