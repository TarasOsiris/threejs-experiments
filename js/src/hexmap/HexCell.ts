import * as THREE from "three";
import {HexCoordinates} from "./HexCoordinates";
import {HexDirection, HexDirectionUtils} from "./HexDirection";
import {HexMetrics} from "./HexMetrics";
import {HexEdgeType} from "./HexEdgeType";
import {HexGridChunk} from "./HexGridChunk";
import {Color} from "three";
import {Nullable} from "../lib/types/Types";

export class HexCell extends THREE.Object3D {
	coordinates: HexCoordinates;
	private _elevation: number = Number.MIN_SAFE_INTEGER;
	private _color = new THREE.Color();
	neighbors: Array<Nullable<HexCell>> = new Array<Nullable<HexCell>>(6);
	textMesh!: THREE.Mesh;
	chunk!: HexGridChunk;

	private _hasIncomingRiver: boolean = false;
	private _hasOutgoingRiver: boolean = false;
	private _incomingRiver: Nullable<HexDirection> = null;
	private _outgoingRiver: Nullable<HexDirection> = null;

	private _roads: Array<boolean> = new Array<boolean>(6).fill(false);
	private _waterLevel: number = 0;

	private _urbanLevel: number = 0;
	private _farmLevel: number = 0;
	private _plantLevel: number = 0;

	private _walled: boolean = false;

	constructor(coordinates: HexCoordinates) {
		super();
		this.neighbors.fill(null);
		this.coordinates = coordinates;
	}

	get hasIncomingRiver(): boolean {
		return this._hasIncomingRiver;
	}

	get hasOutgoingRiver(): boolean {
		return this._hasOutgoingRiver;
	}

	get incomingRiver(): HexDirection {
		return <HexDirection>this._incomingRiver;
	}

	get outgoingRiver(): HexDirection {
		return <HexDirection>this._outgoingRiver;
	}

	get hasRiver(): boolean {
		return this._hasIncomingRiver || this._hasOutgoingRiver;
	}

	get hasRiverBeginOrEnd() {
		return this._hasIncomingRiver != this._hasOutgoingRiver;
	}

	isValidRiverDestination(neighbor: HexCell): boolean {
		return neighbor && (
			this.elevation >= neighbor.elevation || this.waterLevel == neighbor.elevation
		);
	}

	validateRivers() {
		if (
			this.hasOutgoingRiver &&
			!this.isValidRiverDestination(this.getNeighbor(this.outgoingRiver))
		) {
			this.removeOutgoingRiver();
		}
		if (
			this.hasIncomingRiver &&
			!this.getNeighbor(this.incomingRiver).isValidRiverDestination(this)
		) {
			this.removeIncomingRiver();
		}
	}

	get streamBedY() {
		return (this._elevation + HexMetrics.streamBedElevationOffset) * HexMetrics.elevationStep;
	}

	get riverSurfaceY() {
		return (this._elevation + HexMetrics.waterElevationOffset) * HexMetrics.elevationStep;
	}

	get waterSurfaceY() {
		return (this._waterLevel + HexMetrics.waterElevationOffset) * HexMetrics.elevationStep;
	}

	get riverBeginOrEndDirection(): HexDirection {
		return this._hasIncomingRiver ? this._incomingRiver! : this._outgoingRiver!;
	}

	hasRiverThroughEdge(direction: HexDirection) {
		return (this._hasIncomingRiver && this.incomingRiver == direction) || (this._hasOutgoingRiver && this.outgoingRiver == direction);
	}

	hasRoadThroughEdge(direction: HexDirection) {
		return this._roads[direction];
	}

	get hasRoads() {
		return this._roads.some(value => value);
	}

	get waterLevel() {
		return this._waterLevel;
	}

	set waterLevel(value: number) {
		if (this._waterLevel == value) {
			return;
		}
		this._waterLevel = value;
		this.validateRivers();
		this.refresh();
	}

	get isUnderwater() {
		return this._waterLevel > this._elevation;
	}

	get urbanLevel() {
		return this._urbanLevel;
	}

	set urbanLevel(value: number) {
		if (this._urbanLevel != value) {
			this._urbanLevel = value;
			this.refreshSelfOnly();
		}
	}

	get plantLevel() {
		return this._plantLevel;
	}

	set plantLevel(value: number) {
		if (this._plantLevel != value) {
			this._plantLevel = value;
			this.refreshSelfOnly();
		}
	}

	get farmLevel() {
		return this._farmLevel;
	}

	set farmLevel(value: number) {
		if (this._farmLevel != value) {
			this._farmLevel = value;
			this.refreshSelfOnly();
		}
	}

	get walled() {
		return this._walled;
	}

	set walled(value: boolean) {
		if (this._walled != value) {
			this._walled = value;
			this.refresh();
		}
	}

	removeRoads() {
		for (let i = 0; i < this._roads.length; i++) {
			if (this._roads[i]) {
				this.setRoad(i, false);
			}
		}
	}

	addRoad(direction: HexDirection) {
		if (!this._roads[direction] && !this.hasRiverThroughEdge(direction) && this.getElevationDifference(direction) <= 1) {
			this.setRoad(direction, true);
		}
	}

	private setRoad(direction: HexDirection, state: boolean) {
		this._roads[direction] = state;
		this.getNeighbor(direction)._roads[HexDirectionUtils.opposite(direction)] = state;
		this.getNeighbor(direction).refreshSelfOnly();
		this.refreshSelfOnly();
	}

	getElevationDifference(direction: HexDirection): number {
		const difference = this._elevation - this.getNeighbor(direction)._elevation;
		return difference >= 0 ? difference : -difference;
	}

	set elevation(value: number) {
		if (this._elevation == value) {
			return;
		}
		this._elevation = value;
		const position = this.position.clone();
		position.y = value * HexMetrics.elevationStep;
		position.y += (HexMetrics.sampleNoise(position).y * 2 - 1) * HexMetrics.elevationPerturbStrength;
		this.position.set(position.x, position.y, position.z);
		this.textMesh.position.set(this.textMesh.position.x, position.y, this.textMesh.position.z);

		this.validateRivers();

		for (let i = 0; i < this._roads.length; i++) {
			if (this._roads[i] && this.getElevationDifference(i) > 1) {
				this.setRoad(i, false);
			}
		}

		this.refresh();
	}

	get elevation(): number {
		return this._elevation;
	}

	get color(): Color {
		return this._color;
	}

	set color(value: Color) {
		if (this.color.equals(value)) {
			return;
		}
		this._color = value;
		this.refresh();
	}

	get cellPosition(): THREE.Vector3 {
		return this.position;
	}

	public getNeighbor(direction: HexDirection): HexCell {
		return this.neighbors[direction as number]!;
	}

	public setNeighbor(direction: HexDirection, cell: HexCell) {
		this.neighbors[direction as number] = cell;
		cell.neighbors[HexDirectionUtils.opposite(direction) as number] = this;
	}

	getEdgeType(direction: HexDirection): HexEdgeType {
		return HexMetrics.getEdgeType(this.elevation, this.neighbors[direction as number]!.elevation);
	}

	getEdgeTypeWithOtherCell(otherCell: HexCell): HexEdgeType {
		return HexMetrics.getEdgeType(this.elevation, otherCell.elevation);
	}

	refresh() {
		if (this.chunk) {
			this.chunk.markDirty();
			for (let i = 0; i < this.neighbors.length; i++) {
				const neighbor = this.neighbors[i];
				if (neighbor != null && neighbor.chunk != this.chunk) {
					neighbor.chunk.markDirty();
				}
			}
		}
	}

	refreshSelfOnly() {
		this.chunk.markDirty();
	}

	removeOutgoingRiver() {
		if (!this._hasOutgoingRiver) {
			return;
		}

		this._hasOutgoingRiver = false;
		this.refreshSelfOnly();

		const neighbor = this.getNeighbor(this._outgoingRiver!);
		neighbor._hasIncomingRiver = false;
		neighbor.refreshSelfOnly();
	}

	removeIncomingRiver() {
		if (!this._hasIncomingRiver) {
			return;
		}

		this._hasIncomingRiver = false;
		this.refreshSelfOnly();

		const neighbor = this.getNeighbor(this.incomingRiver!);
		neighbor._hasOutgoingRiver = false;
		neighbor.refreshSelfOnly();
	}

	removeRiver() {
		this.removeIncomingRiver();
		this.removeOutgoingRiver();
	}

	setOutgoingRiver(direction: HexDirection) {
		if (this._hasOutgoingRiver && this._outgoingRiver == direction) {
			return;
		}

		const neighbor = this.getNeighbor(direction);
		if (!this.isValidRiverDestination(neighbor)) {
			return;
		}

		this.removeOutgoingRiver();
		if (this._hasIncomingRiver && this._incomingRiver == direction) {
			this.removeIncomingRiver();
		}

		this._hasOutgoingRiver = true;
		this._outgoingRiver = direction;

		neighbor.removeIncomingRiver();
		neighbor._hasIncomingRiver = true;
		neighbor._incomingRiver = HexDirectionUtils.opposite(direction);

		this.setRoad(direction, false);
	}
}
