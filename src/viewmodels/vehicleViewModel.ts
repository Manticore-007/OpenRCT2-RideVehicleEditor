import { Colour, compute, Store, store } from "openrct2-flexui";
import { getAllRides, ParkRide } from "../objects/parkRide";
import { RideTrain } from "../objects/rideTrain";
import { getAllRideTypes, RideType } from "../objects/rideType";
import { RideVehicle } from "../objects/rideVehicle";
import { refreshVehicle } from "../services/events";
import { getSpacingToPrecedingVehicle } from "../services/spacingEditor";
import { CopyFilter, CopyOptions, getTargets, VehicleSettings } from "../services/vehicleCopier";
import { VehicleSpan } from "../services/vehicleSpan";
import { find, findIndex } from "../utilities/arrayHelper";
import * as Log from "../utilities/logger";


/**
 * Viewmodel for the currently selected vehicle.
 */
export class VehicleViewModel
{
	readonly _selectedRide = store<[ParkRide, number] | null>(null);
	readonly _selectedTrain = store<[RideTrain, number] | null>(null);
	readonly _selectedVehicle = store<[RideVehicle, number] | null>(null);

	readonly _rideTypes = store<RideType[]>([]);
	readonly _rides = store<ParkRide[]>([]);
	readonly _trains = compute(this._selectedRide, r => (r) ? r[0]._trains() : []);
	readonly _vehicles = compute(this._selectedTrain, t => (t) ? t[0]._vehicles() : []);

	readonly _type = store<[RideType, number] | null>(null);
	readonly _variants = compute(this._type, t => (t) ? t[0]._variants() : []);
	readonly _variant = store<number>(0);
	readonly _seats = store<number>(0);
	readonly _mass = store<number>(0);
	readonly _poweredAcceleration = store<number>(0);
	readonly _poweredMaxSpeed = store<number>(0);
	readonly _trackProgress = store<number>(0);
	readonly _spacing = store<number | null>(0);
	readonly _x = store<number>(0);
	readonly _y = store<number>(0);
	readonly _z = store<number>(0);

	readonly _primaryColour = store<Colour>(0);
	readonly _secondaryColour = store<Colour>(0);
	readonly _tertiaryColour = store<Colour>(0);

	readonly _isMoving = store(false);
	readonly _isUnpowered = compute(this._selectedVehicle, this._type, this._variant, v => !v || !v[0]._isPowered());
	readonly _isPicking = store<boolean>(false);
	readonly _isEditDisabled = compute(this._selectedVehicle, v => !v);
	readonly _isPositionDisabled = compute(this._isMoving, this._isEditDisabled, (m, e) => m || e);
	readonly _formatPosition = (pos: number): string => (this._isEditDisabled.get() ? "Not available" : pos.toString());
	readonly _multiplierIndex = store<number>(0);
	readonly _multiplier = compute(this._multiplierIndex, idx => (10 ** idx));

	readonly _copyFilters = store<CopyFilter>(0);
	readonly _copyTargetOption = store<CopyOptions>(0);
	readonly _copyTargets = compute(this._copyTargetOption, this._selectedVehicle, (o, v) => getTargets(o, this._selectedRide.get(), this._selectedTrain.get(), v));
	readonly _synchronizeTargets = store<boolean>(false);
	readonly _clipboard = store<VehicleSettings | null>(null);

	private _isOpen?: boolean;
	private _onPlayerAction?: IDisposable;
	private _onGameTick?: IDisposable;

	constructor()
	{
		this._rides.subscribe(r => updateSelectionOrNull(this._selectedRide, r));
		this._trains.subscribe(t => updateSelectionOrNull(this._selectedTrain, t));
		this._vehicles.subscribe(v => updateSelectionOrNull(this._selectedVehicle, v));

		this._selectedVehicle.subscribe(vehicle =>
		{
			if (vehicle && this._isOpen)
			{
				this._updateVehicleInfo(vehicle[0], vehicle[1]);
			}
		});
		refreshVehicle.push(id =>
		{
			if (!this._isOpen)
			{
				Log.debug("[VehicleViewModel] Refresh ignored, window not open.");
				return;
			}
			Log.debug("[VehicleViewModel] Refresh vehicle!");
			const vehicle = this._selectedVehicle.get();
			if (vehicle && vehicle[0]._id === id)
			{
				this._updateVehicleInfo(vehicle[0], vehicle[1]);
			}
		});
	}

	/**
	 * Reload available rides and ride types when the window opens.
	 */
	_open(): void
	{
		Log.debug("[VehicleViewModel] Window opened!");
		this._isOpen = true;
		this._rideTypes.set(getAllRideTypes());
		this._rides.set(getAllRides());

		this._onPlayerAction ||= context.subscribe("action.execute", e => this._onPlayerActionExecuted(e));
		this._onGameTick ||= context.subscribe("interval.tick", () => this._onGameTickExecuted());
	}

	/**
	 * Disposes events that were being listened for.
	 */
	_close(): void
	{
		Log.debug("[VehicleViewModel] Window closed!");
		this._isOpen = false;
		if (this._onPlayerAction)
		{
			this._onPlayerAction.dispose();
		}
		if (this._onGameTick)
		{
			this._onGameTick.dispose();
		}
		this._onPlayerAction = undefined;
		this._onGameTick = undefined;

		// Reset values
		this._multiplierIndex.set(0);
		this._synchronizeTargets.set(false);
	}

	/**
	 * Select a specific car entity.
	 */
	_select(car: Car): void
	{
		const
			rides = this._rides.get(),
			carId = car.id,
			rideId = car.ride,
			carRideIndex = findIndex(rides, r => r._id === rideId);

		if (carRideIndex === null)
		{
			Log.debug("Could not find ride id", rideId, "for selected entity id", carId);
			return;
		}

		this._selectedRide.set([ rides[carRideIndex], carRideIndex ]);

		const trains = this._trains.get();
		for (let t = 0; t < trains.length; t++)
		{
			const vehicles = trains[t]._vehicles();
			for (let v = 0; v < vehicles.length; v++)
			{
				if (vehicles[v]._id === carId)
				{
					this._selectedTrain.set([ trains[t], t ]);
					this._selectedVehicle.set([ vehicles[v], v ]);
					return;
				}
			}
		}
	}

	/**
	 * Attempt to modify the vehicle with the specified action, if a vehicle is selected.
	 */
	_modifyVehicle<T>(action: (vehicles: VehicleSpan[], value: T) => void, value: T): void
	{
		const vehicle = this._selectedVehicle.get();
		if (vehicle)
		{
			if (this._synchronizeTargets.get())
			{
				action(this._copyTargets.get(), value);
			}
			else
			{
				action([[ vehicle[0]._id, 1 ]], value);
			}
		}
		else
		{
			Log.debug("Failed to modify vehicle with", action?.name, "to", value, "; none is selected.");
		}
	}

	/**
	 * Toggle a filter on or off.
	 */
	_setFilter(filter: CopyFilter, toggle: boolean): void
	{
		const enabledFilters = this._copyFilters.get();

		this._copyFilters.set((toggle)
			? (enabledFilters | filter)
			: (enabledFilters & ~filter)
		);
	}

	/**
	 * Updates the viewmodel with refreshed information from a ride vehicle.
	 */
	private _updateVehicleInfo(vehicle: RideVehicle, index: number): void
	{
		const car = vehicle._car(), types = this._rideTypes.get();
		const typeIdx = findIndex(types, t => t._id === car.rideObject);
		const colours = car.colours;

		this._type.set((typeIdx === null) ? null : [ types[typeIdx], typeIdx ]);
		this._seats.set(car.numSeats);
		this._poweredAcceleration.set(car.poweredAcceleration);
		this._poweredMaxSpeed.set(car.poweredMaxSpeed);
		this._primaryColour.set(colours.body);
		this._secondaryColour.set(colours.trim);
		this._tertiaryColour.set(colours.tertiary);
		this._updateDynamicDataFromCar(car, index);
	}

	/**
	 * Updates the viewmodel with refreshed information from a car entity.
	 */
	private _updateDynamicDataFromCar(car: Car, index: number): void
	{
		this._variant.set(car.vehicleObject);
		this._mass.set(car.mass);
		this._trackProgress.set(car.trackProgress);
		this._x.set(car.x);
		this._y.set(car.y);
		this._z.set(car.z);

		const train = this._selectedTrain.get();
		if (train)
		{
			const status = train[0]._at(0)._car().status;
			this._isMoving.set(isMoving(status));
			this._spacing.set(getSpacingToPrecedingVehicle(train[0], car, index));
		}
	}

	/**
	 * Synchronise the data of the model with the car.
	 */
	private _onGameTickExecuted(): void
	{
		const vehicle = this._selectedVehicle.get();
		if (vehicle)
		{
			this._updateDynamicDataFromCar(vehicle[0]._car(), vehicle[1]);
		}
	}

	/**
	 * Triggers for every executed player action.
	 * @param event The arguments describing the executed action.
	 */
	private _onPlayerActionExecuted(event: GameActionEventArgs): void
	{
		if (event.isClientOnly)
		{
			return;
		}
		const action = event.action as ActionType;
		switch (action)
		{
			case "ridecreate":
			case "ridedemolish":
			case "ridesetname":
			{
				this._rides.set(getAllRides());
				break;
			}
			case "ridesetstatus": // close/reopen ride
			{
				const args = <RideSetStatusArgs>event.args;
				const rideId = args.ride;
				const rides = this._rides.get();
				const ride = find(rides, r => r._id === rideId);
				if (ride !== null)
				{
					const rideExists = ride._refresh();
					const selectedRide = this._selectedRide.get();
					if (selectedRide && selectedRide[0]._id === rideId)
					{
						const selectedTrain = this._selectedTrain.get();
						if (rideExists && !selectedTrain)
						{
							Log.debug("Selected ride: status changed to", args.status, ", get newly spawned trains");
							this._trains.set(ride._trains());
						}
						else if (!rideExists || (selectedTrain && !selectedTrain[0]._refresh()))
						{
							Log.debug("Selected ride: status changed to", args.status, ", all trains removed");
							this._trains.set([]);
						}
					}
				}
				break;
			}
			default: return;
		}

		Log.debug("<", action, ">\n\t- type:", event.type, "(client:", event.isClientOnly, ")\n\t- args:", JSON.stringify(event.args), "\n\t- result:", JSON.stringify(event.result));
	}
}


/**
 * Selects the correct entity based on the specified index in the store, or null if anything was deselected.
 */
function updateSelectionOrNull<T>(value: Store<[T, number] | null>, items: T[]): void
{
	let selection: [T, number] | null = null;
	if (items.length > 0)
	{
		const previous = value.get();
		const selectedIdx = (previous && previous[1] < items.length) ? previous[1] : 0;
		selection = [ items[selectedIdx], selectedIdx ];
	}
	Log.debug("[updateSelectionOrNull] =>", selection);
	value.set(selection);
}



/**
 * If the vehicle is in a moving state, the xyz positions cannot be edited, because
 * the game will automatically discard all change attempts.
 */
function isMoving(status: VehicleStatus): boolean
{
	switch (status)
	{
		case "arriving":
		case "crashing":
		case "departing":
		case "moving_to_end_of_station":
		case "travelling_boat":
		case "travelling_cable_lift":
		case "travelling_dodgems":
		case "travelling":
			return true;
	}
	return false;
}
