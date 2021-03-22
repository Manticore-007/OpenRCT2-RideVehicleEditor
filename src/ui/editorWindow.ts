import { ParkRide, RideTrain, RideVehicle } from "../helpers/ridesInPark";
import { RideType } from "../helpers/rideTypes";
import { isDevelopment, pluginVersion } from "../environment";
import DropdownComponent from "../ui/dropdown";
import DropdownSpinnerComponent from "../ui/dropdownSpinner";
import SpinnerComponent from "../ui/spinner";
import ViewportComponent from "../ui/viewport";
import DropdownButtonComponent from "./dropdownButton";
import Log from "../helpers/logger";
import { VehicleSettings } from "../services/editor";


// Shared coordinate constants
const windowStart = 18;
const windowWidth = 375;
const windowHeight = 248;
const widgetLineHeight = 14;
const groupboxMargin = 5;
const groupboxItemMargin = (groupboxMargin + 5);
const groupboxItemWidth = windowWidth - (groupboxItemMargin * 2);

const editorStartY = 90;
const viewportSize = 100;
const controlsSize = (windowWidth - (groupboxMargin * 2) - (viewportSize + 5));
const controlLabelPart = 0.35; // label takes 35%
const controlHeight = 17;
const buttonSize = 24;


let copiedVehicleSettings: VehicleSettings | null = null;


class VehicleEditorWindow
{
	/**
	 * The universal identifier that is used for this window.
	 */
	static readonly identifier = "ride-vehicle-editor";


	readonly ridesInParkList: DropdownComponent;
	readonly trainList: DropdownSpinnerComponent;
	readonly vehicleList: DropdownSpinnerComponent;

	readonly viewport: ViewportComponent;
	readonly rideTypeList: DropdownComponent;
	readonly variantSpinner: SpinnerComponent;
	readonly trackProgressSpinner: SpinnerComponent;
	readonly seatCountSpinner: SpinnerComponent;
	readonly powAccelerationSpinner: SpinnerComponent;
	readonly powMaxSpeedSpinner: SpinnerComponent;
	readonly massSpinner: SpinnerComponent;

	readonly applyToOthersButton: DropdownButtonComponent;
	readonly multiplierDropdown: DropdownComponent;


	/**
	 * Event that triggers when the user presses the 'locate vehicle' button.
	 */
	onLocateVehicle?: () => void;

	
	/**
	 * Event that triggers when the user clicks a vehicle with the vehicle picker button.
	 */
	onPickVehicle?: (entity: number) => void;

	
	/**
	 * Event that triggers when the user presses the 'copy vehicle' button.
	 */
	onCopyVehicle?: () => VehicleSettings | null;
	 
	
	/**
	 * Event that triggers when the user presses the 'copy vehicle' button.
	 */
	onPasteVehicle?: (settings: VehicleSettings) => void;


	/**
	 * Event that triggers every frame update of the window.
	 */
	onUpdate?: () => void;


	/**
	 * Event that triggers when the window is closed.
	 */
	onClose?: () => void;


	private _window?: Window;


	/**
	 * Creates a new window for the specified editor.
	 */
	constructor()
	{
		Log.debug("(window) Open window");

		// Rides in park
		this.ridesInParkList = new DropdownComponent({
			name: "rve-ride-list",
			tooltip: "List of rides in the park",
			x: groupboxItemMargin,
			y: windowStart + 25,
			width: groupboxItemWidth,
			height: widgetLineHeight
		});
		this.ridesInParkList.disableSingleItem = false;

		// Trains on the selected ride
		this.trainList = new DropdownSpinnerComponent({
			name: "rve-train-list",
			tooltip: "List of trains on the currently selected ride",
			x: groupboxItemMargin,
			y: windowStart + 43,
			width: (groupboxItemWidth / 2) - 2,
			height: widgetLineHeight
		});
		this.trainList.disabledMessage = "No trains available";

		// Vehicles in the selected train
		this.vehicleList = new DropdownSpinnerComponent({
			name: "rve-vehicle-list",
			tooltip: "List of vehicles on the currently selected train",
			x: groupboxItemMargin + (groupboxItemWidth / 2) + 2,
			y: windowStart + 43,
			width: (groupboxItemWidth / 2) - 2,
			height: widgetLineHeight
		});
		this.vehicleList.disabledMessage = "No vehicles available";

		// Viewport
		this.viewport = new ViewportComponent({
			name: "rve-viewport",
			x: groupboxMargin,
			y: editorStartY,
			width: viewportSize,
			height: viewportSize
		});

		// Available ride types.
		this.rideTypeList = new DropdownComponent({
			name: "rve-ride-type-list",
			tooltip: "All ride types currently available in the park",
			x: groupboxMargin + viewportSize + 5,
			y: editorStartY,
			width: controlsSize,
			height: widgetLineHeight
		});
		this.rideTypeList.disabledMessage = "No ride types available";
		this.rideTypeList.disableSingleItem = false;

		// Variant sprite of the selected vehicle.
		this.variantSpinner = new SpinnerComponent({
			name: "rve-variant-spinner",
			tooltip: "Sprite variant to use from the selected ride type",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});

		// Sets the track progress of the current vehicle
		this.trackProgressSpinner = new SpinnerComponent({
			name: "rve-track-progress-spinner",
			tooltip: "Distance in steps of how far the vehicle has progressed along the current track piece",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight * 2),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});
		this.trackProgressSpinner.wrapMode = "clampThenWrap";
		this.trackProgressSpinner.minimum = -2_147_483_648;
		this.trackProgressSpinner.maximum = 2_147_483_647;

		// Number of seats of the selected vehicle.
		this.seatCountSpinner = new SpinnerComponent({
			name: "rve-seats-spinner",
			tooltip: "Total amount of passengers that can cuddle up in this vehicle",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight * 3),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});
		this.seatCountSpinner.wrapMode = "clampThenWrap";
		this.seatCountSpinner.maximum = 32; // vehicles refuse more than 32 guests, leaving them stuck just before entering.

		// Total current mass of the selected vehicle.
		this.massSpinner = new SpinnerComponent({
			name: "rve-mass-spinner",
			tooltip: "Total amount of mass (weight) of this vehicle, including all its passengers and your mom",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight * 4),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});
		this.massSpinner.wrapMode = "clampThenWrap";
		this.massSpinner.maximum = 65_536;

		// Powered acceleration of the selected vehicle.
		this.powAccelerationSpinner = new SpinnerComponent({
			name: "rve-powered-acceleration-spinner",
			tooltip: "Cranks up the engines to accelerate faster, self-powered vehicles only",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight * 5),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});
		this.powAccelerationSpinner.wrapMode = "clampThenWrap";
		this.powAccelerationSpinner.maximum = 255;
		this.powAccelerationSpinner.disabledMessage = "Only on powered vehicles.";
		
		// Powered maximum speed of the selected vehicle.
		this.powMaxSpeedSpinner = new SpinnerComponent({
			name: "rve-powered-max-speed-spinner",
			tooltip: "The (il)legal speed limit for your vehicle, self-powered vehicles only",
			x: (groupboxMargin + viewportSize + 5) + (controlsSize * controlLabelPart),
			y: (editorStartY + 1 + controlHeight * 6),
			width: (controlsSize * (1 - controlLabelPart)),
			height: widgetLineHeight,
		});
		this.powMaxSpeedSpinner.wrapMode = "clampThenWrap";
		this.powMaxSpeedSpinner.minimum = 1;
		this.powMaxSpeedSpinner.maximum = 255;
		this.powMaxSpeedSpinner.disabledMessage = "Only on powered vehicles.";

		// Dropdown button to apply current settings to other vehicles
		this.applyToOthersButton = new DropdownButtonComponent({
			name: "rve-apply-to-others-button",
			tooltip: "Apply the current vehicle settings to a specific set of other vehicles on this ride",
			x: (groupboxMargin + viewportSize + 5),
			y: (editorStartY + controlHeight * 7) + 2,
			width: 211,
			height: (widgetLineHeight + 1),
		});
		this.applyToOthersButton.buttons = [
			{ text: "Apply to all vehicles", onClick: () => Log.debug("all vehicles") },
			{ text: "Apply to vehicles after this", onClick: () => Log.debug("next vehicles") },
			{ text: "Apply to vehicles before this", onClick: () => Log.debug("previous vehicles") },
			{ text: "Apply to all trains", onClick: () => Log.debug("all trains") },
		];

		// Dropdown to multiply the spinner increments.
		this.multiplierDropdown = new DropdownComponent({
			name: "rve-multiplier-dropdown",
			tooltip: "Multiplies all spinner controls by the specified amount",
			x: (windowWidth - (groupboxMargin + 45)),
			y: (editorStartY + controlHeight * 7) + 2,
			width: 45,
			height: widgetLineHeight,
		});
		this.multiplierDropdown.items = ["x1", "x10", "x100"];
		this.multiplierDropdown.onSelect = (i => this.updateMultiplier(i));
	}


	/**
	 * Creates a new editor window.
	 */
	private createWindow(): Window
	{
		let windowTitle = `Ride vehicle editor (v${pluginVersion})`;

		if (isDevelopment)
		{
			windowTitle += " [DEBUG]";
		}

		const window = ui.openWindow({
			classification: VehicleEditorWindow.identifier,
			title: windowTitle,
			width: windowWidth,
			height: windowHeight,
			widgets: [
				// Selection group
				<Widget>{
					type: "groupbox",
					x: groupboxMargin,
					y: windowStart,
					width: windowWidth - (groupboxMargin * 2),
					height: 64
				},

				// Ride selector
				<LabelWidget>{
					type: "label",
					x: groupboxItemMargin,
					y: windowStart + 10,
					width: groupboxItemWidth,
					height: widgetLineHeight,
					text: "Pick a ride:"
				},
				this.ridesInParkList.createWidget(),

				// Train & vehicle selectors
				...this.trainList.createWidgets(),
				...this.vehicleList.createWidgets(),

				// Ride vehicle editor:
				this.viewport.createWidget(),
				this.rideTypeList.createWidget(),

				// Vehicle variant
				<LabelWidget>{
					tooltip: this.variantSpinner.description.tooltip,
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Variant:"
				},
				this.variantSpinner.createWidget(),

				// Track progress
				<LabelWidget>{
					tooltip: this.seatCountSpinner.description.tooltip,
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight * 2) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Track progress:"
				},
				this.trackProgressSpinner.createWidget(),

				// Number of seats
				<LabelWidget>{
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight * 3) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Seats:"
				},
				this.seatCountSpinner.createWidget(),

				// Mass
				<LabelWidget>{
					tooltip: this.massSpinner.description.tooltip,
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight * 4) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Mass:"
				},
				this.massSpinner.createWidget(),

				// Powered acceleration
				<LabelWidget>{
					tooltip: this.powAccelerationSpinner.description.tooltip,
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight * 5) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Acceleration:"
				},
				this.powAccelerationSpinner.createWidget(),

				// Powered maximum speed
				<LabelWidget>{
					tooltip: this.powMaxSpeedSpinner.description.tooltip,
					type: "label",
					x: (groupboxMargin + viewportSize + 5),
					y: (editorStartY + controlHeight * 6) + 2,
					width: (controlsSize * controlLabelPart),
					height: widgetLineHeight,
					text: "Max. speed:"
				},
				this.powMaxSpeedSpinner.createWidget(),

				// Toolbar
				...this.applyToOthersButton.createWidgets(),
				this.multiplierDropdown.createWidget(),

				<ButtonWidget>{
					tooltip: "Locate your vehicle when you've lost it (again)",
					type: "button",
					x: (groupboxMargin + 1),
					y: (editorStartY + viewportSize + 8),
					width: buttonSize,
					height: buttonSize,
					image: 5167, // SPR_LOCATE
					onClick: () =>
					{
						if (this.onLocateVehicle)
						{
							this.onLocateVehicle();
						}
					}
				},
				<ButtonWidget>{
					tooltip: "Use the picker to select a vehicle by clicking it",
					name: "rve-picker-button",
					type: "button",
					x: (groupboxMargin + buttonSize + 2),
					y: (editorStartY + viewportSize + 8),
					width: buttonSize,
					height: buttonSize,
					image: 29467, // SPR_G2_EYEDROPPER
					onClick: () => this.pickVehicle()
				},
				<ButtonWidget>{
					tooltip: "Copies the current vehicle settings to your clipboard",
					name: "rve-copy-button",
					type: "button",
					x: (groupboxMargin + (buttonSize + 1) * 2) + 1,
					y: (editorStartY + viewportSize + 8),
					width: buttonSize,
					height: buttonSize,
					isPressed: (copiedVehicleSettings !== null),
					image: 29434, // SPR_G2_COPY
					onClick: () => this.onClickCopy()
				},
				<ButtonWidget>{
					tooltip: "Pastes the previously copied vehicle settings over the currently selected vehicle",
					name: "rve-paste-button",
					type: "button",
					x: (groupboxMargin + (buttonSize + 1) * 3) + 1,
					y: (editorStartY + viewportSize + 8),
					width: buttonSize,
					height: buttonSize,
					isDisabled: (copiedVehicleSettings === null),
					image: 29435, // SPR_G2_PASTE
					onClick: () =>
					{
						if (copiedVehicleSettings !== null && this.onPasteVehicle)
						{
							Log.debug(`(window) Paste settings: ${JSON.stringify(copiedVehicleSettings)}`);
							this.onPasteVehicle(copiedVehicleSettings);
						}
					}
				},
				<LabelWidget>{
					tooltip: "Go to this URL to check for the latest updates",
					type: "label",
					x: (groupboxMargin + 35),
					y: (windowHeight - (widgetLineHeight + 3)),
					width: 275,
					height: widgetLineHeight,
					text: "github.com/Basssiiie/OpenRCT2-RideVehicleEditor",
					isDisabled: true
				},
			],
			onUpdate: () =>
			{
				if (this.onUpdate)
					this.onUpdate();
			},
			onClose: () =>
			{
				Log.debug("(window) Close window.");
				this.viewport.stop();

				if (this.onClose)
					this.onClose();
			}
		});

		this.ridesInParkList.bind(window);
		this.trainList.bind(window);
		this.vehicleList.bind(window);

		this.rideTypeList.bind(window);
		this.variantSpinner.bind(window);
		this.trackProgressSpinner.bind(window);
		this.seatCountSpinner.bind(window);
		this.massSpinner.bind(window);
		this.powAccelerationSpinner.bind(window);
		this.powMaxSpeedSpinner.bind(window);

		this.viewport.bind(window);
		this.applyToOthersButton.bind(window);
		this.multiplierDropdown.bind(window);

		Log.debug("(window) Window creation complete.");
		return window;
	}


	/**
	 * Creates a new vehicle editor, or shows the currently opened one.
	 */
	show()
	{
		if (this._window)
		{
			Log.debug("The ride vehicle editor is already shown.");
			this._window.bringToFront();
		}
		else
		{
			Log.debug("Open the ride vehicle editor.");
			this._window = this.createWindow();
		}
	}


	/**
	 * Closes the currently opened window.
	 */
	close()
	{
		ui.closeWindows(VehicleEditorWindow.identifier);
	}


	/**
	 * Update the ride list with the specified rides in the park.
	 * 
	 * @param rides The rides to show in the list.
	 */
	setRideList(rides: ParkRide[] | null)
	{
		this.ridesInParkList.items = (rides) 
			? (isDevelopment) 
				? rides.map(r => `[${r.rideId}] ${r.name}`) 
				: rides.map(r => r.name) 
			: [];
		this.ridesInParkList.refresh();
	}
	


	/**
	 * Update the train list with the specified trains.
	 * 
	 * @param trains The trains to show in the list.
	 */
	setTrainList(trains: RideTrain[] | null)
	{
		this.trainList.items = (trains) ? trains.map(t => `Train ${t.index + 1}`) : [];
		this.trainList.refresh();
	}


	/**
	 * Updates the vehicle list with the specified vehicles.
	 * 
	 * @param vehicles The vehicles to show in the list.
	 */
	setVehicleList(vehicles: RideVehicle[] | null)
	{
		this.vehicleList.items = (vehicles) ? vehicles.map((_, i) => `Vehicle ${i + 1}`) : [];
		this.vehicleList.refresh();
	}


	/**
	 * Disables the editor controls.
	 */
	disableEditorControls()
	{
		this.rideTypeList.active(false);
		this.variantSpinner.active(false);
		this.trackProgressSpinner.active(false);
		this.seatCountSpinner.active(false);
		this.powAccelerationSpinner.active(false);
		this.powMaxSpeedSpinner.active(false);
		this.massSpinner.active(false);
		this.viewport.stop();
	}


	/**
	 * Updates the ride type list with the specified ride types.
	 * 
	 * @param rideTypes The ride types to show in the ride type list.
	 */
	setRideTypeList(rideTypes: RideType[])
	{
		this.rideTypeList.items = (isDevelopment) 
			? rideTypes.map(t => `[${t.rideIndex}] ${t.name}`) 
			: rideTypes.map(t => t.name);
		this.rideTypeList.refresh();
	}


	/**
	 * Updates the multiplier based on which checkbox was updated.
	 * 
	 * @param selectedIndex The index of the multiplier option that was selected.
	 */
	private updateMultiplier(selectedIndex: number)
	{
		const increment = (10 ** selectedIndex);
		Log.debug(`(window) Updated multiplier to ${increment}. (index: ${selectedIndex})`)

		this.setSpinnerIncrement(this.trackProgressSpinner, increment);
		this.setSpinnerIncrement(this.seatCountSpinner, increment);
		this.setSpinnerIncrement(this.powAccelerationSpinner, increment);
		this.setSpinnerIncrement(this.powMaxSpeedSpinner, increment);
		this.setSpinnerIncrement(this.massSpinner, increment);
	}


	/**
	 * Sets the increment of the spinner to the specified amount, and refreshes it.
	 * 
	 * @param spinner The spinner to update.
	 * @param increment The increment the spinner should use.
	 */
	private setSpinnerIncrement(spinner: SpinnerComponent, increment: number)
	{
		spinner.increment = increment;
		spinner.refresh();
	}


	/**
	 * Starts a tool that allows the user to click on a vehicle to select it.
	 */
	private pickVehicle()
	{
		const pickerButton = this.getWidget<ButtonWidget>("rve-picker-button");
		if (pickerButton.isPressed)
		{
			const tool = ui.tool;
			if (tool && tool.id === "rve-pick-vehicle")
			{
				tool.cancel();
			}
			pickerButton.isPressed = false;
		}
		else
		{
			ui.activateTool({
				id: "rve-pick-vehicle",
				cursor: "cross_hair",
				onDown: a => 
				{
					if (a.entityId && this.onPickVehicle)
					{
						this.onPickVehicle(a.entityId);
						ui.tool?.cancel();
					}
				},
				onFinish: () =>
				{
					const pickerButton = this.getWidget<ButtonWidget>("rve-picker-button");
					pickerButton.isPressed = false;
				}
			});
			pickerButton.isPressed = true;
		}
	}


	/**
	 * Enables and disables the copy/paste buttons depending on the copy state.
	 */
	private onClickCopy()
	{
		const copyWidget = this.getWidget<ButtonWidget>("rve-copy-button");
		if (copyWidget.isPressed)
		{
			copyWidget.isPressed = false;
			copiedVehicleSettings = null;
		}
		else if (this.onCopyVehicle)
		{
			copiedVehicleSettings = this.onCopyVehicle();
			if (copiedVehicleSettings !== null)
			{
				copyWidget.isPressed = true;
			}
		}
		Log.debug(`(window) Copied: ${copyWidget.isPressed}`);

		const pasteWidget = this.getWidget<ButtonWidget>("rve-paste-button");
		pasteWidget.isDisabled = !copyWidget.isPressed;
	}


	/**
	 * Returns the widget with the specified name, if the window is active.
	 * 
	 * @param name The name of the widget.
	 */
	private getWidget<TWidget extends Widget>(name: string): TWidget
	{
		const widget = ui.getWindow(VehicleEditorWindow.identifier)?.findWidget<TWidget>(name);
		if (!widget)
		{
			throw `Cannot find widget '${name}' in editor window.`;
		}
		return widget;
	}
}

export default VehicleEditorWindow;
