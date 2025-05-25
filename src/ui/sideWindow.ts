import { button, checkbox, CheckboxParams, Colour, colourPicker, compute, dropdown, DropdownParams, dropdownSpinner, DropdownSpinnerParams, FlexiblePosition, groupbox, horizontal, label, LabelParams, listview, spinner, SpinnerParams, store, tab, tabwindow, toggle, twoway, vertical, WidgetCreator } from "openrct2-flexui";
import { pluginVersion } from "../environment";
import { getWindow, labelled, labelledSpinner, LabelledSpinnerParams, multiplier } from "./utilityControls";
import { changeSpacing, changeTrackProgress, setMass, setPositionX, setPositionY, setPositionZ, setPoweredAcceleration, setPoweredMaximumSpeed, setPrimaryColour, setReversed, setRideType, setSeatCount, setSecondaryColour, setSpin, setTertiaryColour, setVariant } from "../services/vehicleEditor";
import { applyToTargets, CopyFilter, getTargets, getVehicleSettings } from "../services/vehicleCopier";
import { RideVehicleVariant, VehicleVisibility } from "../objects/rideVehicleVariant";
import { RideType } from "../objects/rideType";
import * as Log from "../utilities/logger";
import { getDistanceFromProgress } from "../services/spacingEditor";
import { VehicleSpan } from "../services/vehicleSpan";
import { floor } from "../utilities/math";
import { RideViewModel } from "../viewmodels/rideViewModel";
import { setBuildMonth, setBuildYear, setCustomDesign, setExcitementRating, setFrozenRatings, setIndestructable, setIntensityRating, setNauseaRating } from "../services/rideEditor";
import { formatRelativeDate, getDateMonth, getDateYear, monthNames } from "../utilities/date";
import { ParkRide } from "../objects/parkRide";
import { VehicleViewModel } from "../viewmodels/vehicleViewModel";

/**
 * The viewmodel for the vehicle editor.
 */
export const model = new VehicleViewModel();

export const stickySideWindow = store<boolean>(context.sharedStorage.get("pe.sticky", true));
export const sideWindowActive = store<boolean>(false);
export const isEditRideTabOpen = store<boolean>(false);

let main: Window | undefined;
let side: Window | undefined;

const rideModel = new RideViewModel();

const sideWindowHeight = 230;
const buttonSize = 24;
const controlsLabelWidth = 82;
const controlsWidth = 244;
const controlsSpinnerWidth = controlsWidth - (controlsLabelWidth + 4 + 12); // include spacing
const int16max = 32_767, int16min = -32_768;

// Tips that are used multiple times
const applyOptionsTip = "Copy the selected vehicle settings to a specific set of other vehicles on this ride.";

model._selectedRide.subscribe(r =>
{
    rideModel._ride.set((r) ? r[0] : null);
});

export const sideWindow = tabwindow({
    title: "Side window",
    width: 260,
    height: sideWindowHeight,
    colours: [Colour.BordeauxRed, Colour.Grey, Colour.Grey],
    onOpen: () =>
    {
        main = getWindow("Ride vehicle editor (v" + pluginVersion + ") [DEBUG]");
        side = getWindow("Side window");
        sideWindowActive.set(true);
    },
    onClose: () =>
        {
            sideWindowActive.set(false);
            if (main) main.height =230;
        },
    onUpdate: () =>
    {
        isSideWindowSticky();
    },
    tabs: [
        tab({
            image: {frameBase: context.getIcon('ride'), frameCount: 16, frameDuration: 4 },
            onOpen: () => {if (main) main.height = sideWindowHeight},
            height: "inherit",
            spacing: 0,
            content: [
                groupbox({ // selection top bar
                    text: "Pick a ride...",
                    content: [
                        vertical([
                            listview({ // ride list
                                items: compute(model._rides, c => c.map(r => r._ride().name)),
                                tooltip: "List of rides in the park",
                                canSelect: true,
                                onClick: idx => model._selectRide(idx)
                            }),
                            dropdownSpinner({ // train list
                                items: compute(model._trains, c => c.map((t, i) => ("Train " + (t._special ? "?" : (i + 1))))),
                                tooltip: "List of trains on the currently selected ride",
                                disabledMessage: "No trains available",
                                autoDisable: "single",
                                selectedIndex: compute(model._selectedTrain, t => t ? t[1] : 0),
                                onChange: idx => model._selectTrain(idx)
                            }),
                            dropdownSpinner({ // vehicle list
                                items: compute(model._vehicles, c => c.map((_, i) => ("Vehicle " + (i + 1)))),
                                tooltip: "List of vehicles on the currently selected train",
                                disabledMessage: "No vehicles available",
                                autoDisable: "single",
                                selectedIndex: compute(model._selectedVehicle, v => v ? v[1] : 0),
                                onChange: idx => model._selectedVehicle.set([model._vehicles.get()[idx], idx])
                            })
                        ])
                    ]
                }),
            ]
        }),
        tab({
            image: { frameBase: context.getIcon("view"), frameCount: 1, frameDuration: 4, offset: { x: 1, y: -1 }},
            onOpen: () => {if (main) main.height = sideWindowHeight},
            content: [
					vertical({
						// control part
						width: controlsWidth,
						spacing: 8,
						content: [
							groupbox({
								text: "Visuals",
								content: [
									listview({ // vehicle type editor
										items: compute(model._rideTypes, getUniqueRideTypeNames),
										tooltip: "All ride types currently available in the park",
										disabled: compute(model._isEditDisabled, model._type, (noEdit, type) => (noEdit || !type)),
                                        canSelect: true,
										onClick: idx => updateVehicleType(idx)
									}),
									labelledSpinner<DropdownSpinnerParams>({
										_label: { text: "Variant:" },
										_control: dropdownSpinner,
										tooltip: "Sprite variant to use from the selected ride type",
										items: compute(model._variants, c => c.map((v, i) => formatVariant(v, i))),
										wrapMode: "wrap",
										disabled: compute(model._isEditDisabled, model._variants, (noEdit, variants) => (noEdit || variants.length < 2)),
										selectedIndex: model._variant,
										onChange: value => model._modifyVehicle(setVariant, value, CopyFilter.TypeAndVariant)
									}),
									labelled<CheckboxParams>({
										_control: checkbox,
										_label: { text: "Reversed:", width: controlsLabelWidth },
										tooltip: "Look behind you!",
										disabled: model._isEditDisabled,
										isChecked: model._isReversed,
										onChange: value => model._modifyVehicle(setReversed, value, CopyFilter.TypeAndVariant)
									}),
									horizontal([
										label({
											text: "Colours:",
											tooltip: "The three important boxes that make the vehicle pretty on demand.",
											width: controlsLabelWidth,
											disabled: model._isEditDisabled
										}),
										colourPicker({
											tooltip: "The primary (body) colour of the vehicle.",
											colour: model._primaryColour,
											disabled: model._isEditDisabled,
											onChange: value => model._modifyVehicle(setPrimaryColour, value, CopyFilter.Colours)
										}),
										colourPicker({
											tooltip: "The secondary (trim) colour of the vehicle.",
											colour: model._secondaryColour,
											disabled: model._isEditDisabled,
											onChange: value => model._modifyVehicle(setSecondaryColour, value, CopyFilter.Colours)
										}),
										colourPicker({
											tooltip: "The tertiary (detail) colour of the vehicle.",
											colour: model._tertiaryColour,
											disabled: model._isEditDisabled,
											onChange: value => model._modifyVehicle(setTertiaryColour, value, CopyFilter.Colours)
										})
									])
								]
							}),
                        ]
                    })
                    
            ]
        }),
        tab({
            image: { frameBase: context.getIcon("map"), frameCount: 1, frameDuration: 4, offset: { x: 4, y: 1 }},
            onOpen: () => {if (main) main.height = sideWindowHeight},
            content: [
                groupbox({
                    text: "Positioning",
                    spacing: 3,
                    content: [
                        labelSpinner({
                            _label: { text: "Track progress:" },
                            tooltip: "Distance in steps of how far the vehicle has progressed along the current track piece",
                            disabled: model._isEditDisabled,
                            step: model._multiplier,
                            value: twoway(model._trackProgress),
                            onChange: (_, incr) => applyTrackProgressChange(changeTrackProgress, incr, CopyFilter.TrackProgress)
                        }),
                        labelSpinner({
                            _label: { text: "Spacing:" },
                            tooltip: "Choose whether either tailgating or social distancing is the best for your vehicle",
                            disabled: compute(model._isEditDisabled, model._selectedVehicle, (noEdit, vehicle) => (noEdit || !vehicle || vehicle[1] === 0)),
                            step: model._multiplier,
                            value: compute(model._spacing, v => v || 0),
                            format: () => {
                                const spacing = model._spacing.get();
                                return (spacing === null) ? "Too far away" : spacing.toString();
                            },
                            onChange: (_, incr) => applyTrackProgressChange(changeSpacing, incr, CopyFilter.Spacing)
                        }),
                        positionSpinner({
                            _label: { text: "X position:" },
                            disabled: model._isPositionDisabled,
                            step: model._multiplier,
                            value: model._x,
                            format: model._formatPosition,
                            onChange: (_, incr) => model._modifyVehicle(setPositionX, incr, CopyFilter.Position)
                        }),
                        positionSpinner({
                            _label: { text: "Y position:" },
                            disabled: model._isPositionDisabled,
                            step: model._multiplier,
                            value: model._y,
                            format: model._formatPosition,
                            onChange: (_, incr) => model._modifyVehicle(setPositionY, incr, CopyFilter.Position)
                        }),
                        positionSpinner({
                            _label: { text: "Z position:" },
                            disabled: model._isPositionDisabled,
                            step: model._multiplier,
                            value: model._z,
                            format: model._formatPosition,
                            onChange: (_, incr) => model._modifyVehicle(setPositionZ, incr, CopyFilter.Position)
                        }),
                        labelSpinner({
                            _label: { text: "Spin angle:" },
                            minimum: 0,
                            maximum: compute(model._spinFrames, frames => frames > 0 ? frames - 1 : 0),
                            disabled: model._isSpinDisabled,
                            step: model._multiplier,
                            value: compute(model._spin, model._spinFrames, (spin, frames) => floor((spin * frames) / 256)),
                            onChange: (_, incr) => model._modifyVehicle(setSpin, floor((incr * 256) / model._spinFrames.get()), CopyFilter.Spin)
                        })
                    ]
                }),
                multiplier(model._multiplierIndex)
            ]
        }),
        tab({
            image: { frameBase: 5205, frameCount: 16, frameDuration: 2, },
            onOpen: () => {if (main) main.height = sideWindowHeight},
            content: [
                groupbox({
                    text: "Properties",
                    spacing: 3,
                    content: [
                        labelSpinner({
                            _label: { text: "Seats:" },
                            tooltip: "Total amount of passengers that can cuddle up in this vehicle",
                            minimum: 0,
                            maximum: 32, // vehicles refuse more than 32 guests, leaving them stuck just before entering.
                            disabled: model._isEditDisabled,
                            step: model._multiplier,
                            value: model._seats,
                            onChange: value => model._modifyVehicle(setSeatCount, value, CopyFilter.Seats)
                        }),
                        labelSpinner({
                            _label: { text: "Mass:" },
                            tooltip: "Total amount of mass (weight) of this vehicle, including all its passengers and your mom",
                            minimum: 0,
                            maximum: 65_535,
                            disabled: model._isEditDisabled,
                            step: model._multiplier,
                            value: model._mass,
                            onChange: value => model._modifyVehicle(setMass, value, CopyFilter.Mass)
                        }),
                        labelSpinner({
                            _label: { text: "Acceleration:" },
                            tooltip: "Cranks up the engines to accelerate faster, self-powered vehicles only",
                            disabledMessage: "Powered vehicles only",
                            minimum: 0,
                            maximum: 255,
                            disabled: model._isUnpowered,
                            step: model._multiplier,
                            value: model._poweredAcceleration,
                            onChange: value => model._modifyVehicle(setPoweredAcceleration, value, CopyFilter.PoweredAcceleration)
                        }),
                        labelSpinner({
                            _label: { text: "Max. speed:" },
                            tooltip: "The (il)legal speed limit for your vehicle, self-powered vehicles only",
                            disabledMessage: "Powered vehicles only",
                            minimum: 1,
                            maximum: 255,
                            disabled: model._isUnpowered,
                            step: model._multiplier,
                            value: model._poweredMaxSpeed,
                            onChange: value => model._modifyVehicle(setPoweredMaximumSpeed, value, CopyFilter.PoweredMaxSpeed)
                        })
                    ]
                }),
                multiplier(model._multiplierIndex)
            ]
        }),
        tab({
            image: { frameBase: 5318, frameCount: 8, frameDuration: 2, },
            onOpen: () => {if (main) main.height = sideWindowHeight},
            content: [
                horizontal([
                    vertical({
                        content: [ // toolbar
                            groupbox({
                                text: "Apply & synchronize",
                                spacing: 8,
                                content: [
                                    horizontal([
                                        vertical({
                                            spacing: 1,
                                            content: [
                                            checkbox({
                                                text: "Type & variant",
                                                tooltip: "Copy the selected ride type and variant to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.TypeAndVariant)),
                                                onChange: c => model._setFilter(CopyFilter.TypeAndVariant, c)
                                            }),
                                            checkbox({
                                                text: "Colours",
                                                tooltip: "Copy the selected vehicle colours to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Colours)),
                                                onChange: c => model._setFilter(CopyFilter.Colours, c)
                                            }),
                                            checkbox({
                                                text: "Track progress",
                                                tooltip: "Synchronize the selected track progress changes to other vehicles (apply not supported).",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.TrackProgress)),
                                                onChange: c => model._setFilter(CopyFilter.TrackProgress, c)
                                            }),
                                            checkbox({
                                                text: "Spacing",
                                                tooltip: "Synchronize the selected spacing changes to other vehicles (apply not supported).",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Spacing)),
                                                onChange: c => model._setFilter(CopyFilter.Spacing, c)
                                            }),
                                            checkbox({
                                                text: "Position",
                                                tooltip: "Synchronize the selected position changes to other vehicles (apply not supported).",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Position)),
                                                onChange: c => model._setFilter(CopyFilter.Position, c)
                                            })
                                        ]
                            }),
                                        vertical({
                                            spacing: 1,
                                            content: [
                                            checkbox({
                                                text: "Seats",
                                                tooltip: "Copy the selected seat count to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Seats)),
                                                onChange: c => model._setFilter(CopyFilter.Seats, c)
                                            }),
                                            checkbox({
                                                text: "Mass",
                                                tooltip: "Copy the selected mass (weight) to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Mass)),
                                                onChange: c => model._setFilter(CopyFilter.Mass, c)
                                            }),
                                            checkbox({
                                                text: "Acceleration",
                                                tooltip: "Copy the selected powered acceleration to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.PoweredAcceleration)),
                                                onChange: c => model._setFilter(CopyFilter.PoweredAcceleration, c)
                                            }),
                                            checkbox({
                                                text: "Max. speed",
                                                tooltip: "Copy the selected maximum powered speed to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.PoweredMaxSpeed)),
                                                onChange: c => model._setFilter(CopyFilter.PoweredMaxSpeed, c)
                                            }),
                                            checkbox({
                                                text: "Spin",
                                                tooltip: "Copy the selected spin to other vehicles.",
                                                isChecked: compute(model._copyFilters, f => !!(f & CopyFilter.Spin)),
                                                onChange: c => model._setFilter(CopyFilter.Spin, c)
                                            })
                                        ]
                            })
                                    ]),
                                    dropdown({
                                        padding: {top: -4},
                                        items: [
                                            "All vehicles on this train",
                                            "Preceding vehicles on this train",
                                            "Following vehicles on this train",
                                            "Specific vehicles on this train",
                                            "All vehicles on all trains",
                                            "Preceding vehicles on all trains",
                                            "Following vehicles on all trains",
                                            "Same vehicle number on all trains",
                                            "Specific vehicles on all trains"
                                        ],
                                        tooltip: applyOptionsTip,
                                        selectedIndex: model._copyTargetOption,
                                        onChange: idx => {
                                            model._setSequence(idx);
                                            model._copyTargetOption.set(idx);
                                        }
                                    }),
                                    horizontal({
                                        padding: { top: -4, left: "1w" },
                                        content: [
                                            label({
                                                text: "Apply to every # vehicle(s):",
                                                tooltip: "Applies settings to every selected number of vehicles",
                                                width: 175,
                                                visibility: compute(model._isSequence, s => s ? "visible" : "none")
                                            }),
                                            spinner({
                                                tooltip: "Applies settings to every selected number of vehicles",
                                                width: 60,
                                                value: 1,
                                                minimum: 1,
                                                maximum: compute(model._vehicles, c => c.length || 1),
                                                step: model._multiplier,
                                                visibility: compute(model._isSequence, s => s ? "visible" : "none"),
                                                onChange: v => model._sequence.set(v)
                                            })
                                        ]
                                    }),
                                    horizontal({
                                        padding: { top: -4, left: "1w" },
                                        content: [
                                            label({
                                                text: "Amount of vehicles to modify",
                                                tooltip: "Selects which vehicle of the train is the last to modify",
                                                width: 175,
                                                visibility: compute(model._isSequence, s => s ? "visible" : "none")
                                            }),
                                            spinner({
                                                tooltip: "Sets the amount of vehicles to modify",
                                                width: 60,
                                                value: compute(model._vehicles, c => c.length),
                                                minimum: 1,
                                                maximum: compute(model._vehicles, model._selectedVehicle, (c, s) => (s) ? c.length - s[1] : 1),
                                                step: model._multiplier,
                                                visibility: compute(model._isSequence, s => s ? "visible" : "none"),
                                                onChange: v => model._amount.set(v)
                                            })
                                        ]
                                    }),
                                    horizontal([
                                        button({
                                            text: "Apply",
                                            tooltip: applyOptionsTip,
                                            height: buttonSize,
                                            padding: {top: "1w"},
                                            disabled: model._isEditDisabled,
                                            onClick: () => applySelectedSettingsToRide()
                                        }),
                                        toggle({
                                            text: "Synchronize",
                                            tooltip: "Enable this and every change you make, will be made to the other vehicles as well. It's like synchronized swimming!",
                                            height: buttonSize,
                                            padding: {top: "1w",},
                                            disabled: model._isEditDisabled,
                                            isPressed: model._synchronizeTargets,
                                            onChange: enabled => model._synchronizeTargets.set(enabled)
                                        })
                                    ])
                                ]
                            })
                        ]
                    }),

                ])
            ]
        }),
        tab({
            image: { frameBase: 5229, frameCount: 8, frameDuration: 8 },
            height: 322,
            onOpen: () => {
                rideModel._open();
                isEditRideTabOpen.set(true);
                if (main && stickySideWindow.get()) main.height = 322;
            },
            onClose: () => isEditRideTabOpen.set(false),
            content: [
		groupbox({
			text: "Ratings",
			tooltip: "Edit the ratings of the ride",
            spacing: 2,
			content: [
				labelSpinner({
					_label: { text: "Excitement:" },
					tooltip: "Happy guests make for a happy life.",
					value: rideModel._excitement,
					step: rideModel._multiplier,
					minimum: int16min,
					maximum: int16max,
					format: formatRating,
					onChange: value => modifyRide(setExcitementRating, value)
				}),
				labelSpinner({
					_label: { text: "Intensity:" },
					tooltip: "Guests will prefer rides that match their intensity preference.",
					value: rideModel._intensity,
					step: rideModel._multiplier,
					minimum: int16min,
					maximum: int16max,
					format: formatRating,
					onChange: value => modifyRide(setIntensityRating, value)
				}),
				labelSpinner({
					_label: { text: "Nausea:" },
					tooltip: "The higher the value, the more yellow your paths will be.",
					value: rideModel._nausea,
					step: rideModel._multiplier,
					minimum: int16min,
					maximum: int16max,
					format: formatRating,
					onChange: value => modifyRide(setNauseaRating, value)
				}),
				checkbox({
					text: "Freeze rating calculation",
					tooltip: "When ticked, the ratings will not be recalculated anymore. Your ride will always be awesome even if it sucks.",
					isChecked: rideModel._freezeStats,
					onChange: v => modifyRide(setFrozenRatings, v)
				})
			]
		}),
		groupbox({
			text: "Construction",
			tooltip: "Edit properties related to the construction of the ride",
            spacing: 2,
			content: [
				labelled<DropdownParams>({
					_control: dropdown,
					_label: { text: "Build month:", width: controlsLabelWidth },
					tooltip: "The month in which this ride was built. Somehow never in the winter months.",
					items: monthNames,
					selectedIndex: compute(rideModel._buildMonth, month => getDateMonth(month)),
					onChange: value => modifyRide(setBuildMonth, value)
				}),
				labelSpinner({
					_label: { text: "Build year:" },
					tooltip: "The year in which this ride was built.",
					wrapMode: "clamp",
					value: compute(rideModel._buildMonth, month => getDateYear(month)),
					step: rideModel._multiplier,
					minimum: -268_435_456, // 32-bit min / 8 months + 1
					maximum: 268_435_455, // 32-bit max / 8 months
					onChange: value => modifyRide(setBuildYear, value)
				}),
				labelled<LabelParams>({
					_control: label,
					_label: { text: "Construction:", width: controlsLabelWidth },
					text: compute(rideModel._buildMonth, rideModel._currentMonth, (build, current) => formatRelativeDate(build - current)),
					tooltip: "The amount of time ago the ride was built, in months and years. Rides get older as well, just like you."
				}),
				checkbox({
					text: "Custom design",
					tooltip: "Whether or not the ride is a custom design or a standard track design, which is used for the 'Best custom-designed rides' award.",
					isChecked: rideModel._customDesign,
					onChange: value => modifyRide(setCustomDesign, value)
				}),
				checkbox({
					text: "Indestructable",
					tooltip: "Indestructable rides cannot be demolished, even if you ask them nicely.",
					isChecked: rideModel._indestructable,
					onChange: value => modifyRide(setIndestructable, value)
				})
			]
		}),
                groupbox({
                    text: "Ride name",
                    tooltip: "Edit the name of the ride",
                    spacing: 2,
                    content: [
                        label({
                            text: compute(model._selectedRide, (r): string =>
                            {
                                if (r)
                                {
                                    const ride = r[0]._ride();
                                    return ride.name
                                }
                                else return ""
                            }
                        )
                        }),
                        button({
                            text: "Rename ride",
                            height: buttonSize,
                            onClick: () =>
                            {
                                ui.showTextInput({
                                    title: "Ride/attraction name",
                                    initialValue: rideModel._title.get(),
                                    description: "Enter new name for this ride/attraction:",
                                    callback: (input) =>
                                    {
                                        const ride = rideModel._ride.get();
                                        if (ride) context.executeAction("ridesetname", { ride: ride._id, name: input });
                                    }
                                });
                            }
                        })
                    ]
                }),
                multiplier(model._multiplierIndex)
            ]
        })
    ]
})

/**
 * Apply settings of current vehicle to other vehicles in the ride.
 */
function applySelectedSettingsToRide(): void
{
	const vehicle = model._selectedVehicle.get();
	if (vehicle)
	{
		applyToTargets(
			getVehicleSettings(vehicle[0], model._copyFilters.get()),
			getTargets(model._copyTargetOption.get(), model._selectedRide.get(), model._selectedTrain.get(), vehicle, model._amount.get()),
			model._sequence.get()
		);
	}
}

/**
 * Combines a label and a spinner into one widget creator, with the same tooltip for the location spinners.
 */
function positionSpinner(params: LabelledSpinnerParams & FlexiblePosition): WidgetCreator<FlexiblePosition>
{
	params.tooltip = "The fantastic map location of your vehicle and where to find it. Only works when the vehicle is not moving.";
	params.minimum = 0;
	params.wrapMode = "clamp";
	params._noDisabledMessage = true;
	return labelSpinner(params);
}

/**
 * Combines a label and a spinner into one widget creator.
 */
function labelSpinner<T extends (SpinnerParams | DropdownSpinnerParams) = SpinnerParams>(params: LabelledSpinnerParams<T> & FlexiblePosition): WidgetCreator<FlexiblePosition>
{
	params.width = controlsSpinnerWidth;
	params._label.width = controlsLabelWidth;
	return labelledSpinner(params);
}

/**
 * Apply the same amount of track progress to all selected vehicles based on the currently selected car.
 */
function applyTrackProgressChange(action: (vehicles: VehicleSpan[], value: number, sequence: number) => void, increment: number, filter: CopyFilter): void
{
	const selectedVehicle = model._selectedVehicle.get();
	if (selectedVehicle)
	{
		const distance = getDistanceFromProgress(selectedVehicle[0]._car(), increment);
		model._modifyVehicle(action, distance, filter);
	}
}

/**
 * Hack: make ride type names unique so they don't get mixed up.
 */
function getUniqueRideTypeNames(rideTypes: RideType[]): string[]
{
	const length = rideTypes.length;
	const array = Array<string>(length);
	let streak: string | undefined;
	let last: string | undefined;
	let current: string | undefined;
	let idx = 0;

	for (; idx < length; idx++)
	{
		current = rideTypes[idx]._object().name;

		if (current === streak)
		{
			last += " "; // Add invisible space to add difference.
		}
		else
		{
			streak = last = current;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		array[idx] = last!;
	}

	Log.debug("getUniqueRideTypeNames():", array);
	return array;
}
    


/**
 * Updates the viewmodel with the new vehicle type.
 */
function updateVehicleType(typeIdx: number): void
{
    const type = model._rideTypes.get()[typeIdx];
    model._modifyVehicle(setRideType, type, CopyFilter.TypeAndVariant);
}

/**
 * Format function that labels variants invisible if they are.
 */
function formatVariant(variant: RideVehicleVariant, index: number): string
{
	const visibility = variant._visibility;
	if (visibility === VehicleVisibility.Visible) return index.toString()
    {
    	const visibilityLabel = (!visibility) ? "green square" : "invisible";
    	return (index + "  (" + visibilityLabel + ")");
    }
}

function formatRating(value: number): string
{
	return (value / 100).toFixed(2);
}

function modifyRide<T>(action: (ride: ParkRide, value: T) => void, value: T): void
{
	const ride = rideModel._ride.get();
	if (ride) action(ride, value);
	else Log.debug("Failed to modify ride with", action, "to", value, "; none is selected.");
}

export function isSideWindowSticky(): void {
	if (context.sharedStorage.get("pe.sticky"))
		if (main && side)
        {
			side.x = main.x + main.width;
			side.y = main.y;
		}
		else return;
}