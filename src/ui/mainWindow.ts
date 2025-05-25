import { button, checkbox, Colour, compute, dropdown, groupbox, horizontal, label, store, tab, tabwindow, toggle, vertical, viewport } from "openrct2-flexui";
import { isDevelopment, pluginVersion } from "../environment";
import { isValidGameVersion } from "../services/versionChecker";
import { getWindow } from "./utilityControls";
import { isEditRideTabOpen, model, sideWindow, sideWindowActive, stickySideWindow } from "./sideWindow";

/**
 * Opens the ride editor window.
 */
export function openEditorWindow(): void
{
	// Check if game is up-to-date...
	if (isValidGameVersion())
	{
		// Show the current instance if one is active.
		mainWindow.open();
	}
}

let main: Window | undefined;
let side: Window | undefined;

const buttonSize = 24;
const theme = store<Theme>(context.sharedStorage.get("rve.theme", "rct1"));

let title = ("Ride vehicle editor (v" + pluginVersion + ")");
if (isDevelopment)
{
	title += " [DEBUG]";
}

const mainWindow = tabwindow({
	title,
	width: 260,
	height: 230,
    colours: [Colour.BordeauxRed, Colour.Grey, Colour.Grey],
	onOpen: () =>
		{
			main = getWindow(title);
			side = getWindow("Side window");
			model._open();
			sideWindow.open();
		},
	onClose: () =>
	{
		model._close();
		getWindow("Side window")?.close();
	},
	tabs: [
		tab({
			image: { frameBase: context.getIcon("search"), frameCount: 1, frameDuration: 4, offset: { x: 4, y: 1 } },
			onOpen: () => setWindowHeight(),
			content: [
				horizontal([
					viewport({
						tooltip: "I can see my house from here!",
						target: compute(model._selectedVehicle, c => (c) ? c[0]._id : null),
						disabled: model._isEditDisabled
					}),
					vertical({
						padding: ["1w", 0],
						spacing: 4,
						content: [ // buttons
							toggle({
								width: buttonSize, height: buttonSize,
								tooltip: "Use the picker to select a vehicle by clicking it",
								image: "eyedropper", // SPR_G2_EYEDROPPER
								isPressed: model._isPicking,
								onChange: pressed => model._setPicker(pressed)
							}),
							toggle({
								width: buttonSize, height: buttonSize,
								tooltip: "Drag stationary vehicles to new places on the map",
								image: 5174, // SPR_PICKUP_BTN
								disabled: model._isPositionDisabled,
								isPressed: model._isDragging,
								onChange: pressed => model._setDragger(pressed)
							}),
							toggle({
								width: buttonSize, height: buttonSize,
								tooltip: "Copies the current vehicle settings to your clipboard, so you can use it on another ride",
								image: "copy", // SPR_G2_COPY,
								disabled: model._isEditDisabled,
								isPressed: compute(model._clipboard, clip => !!clip),
								onChange: pressed => model._copy(pressed)
							}),
							button({
								width: buttonSize, height: buttonSize,
								tooltip: "Pastes the previously copied vehicle settings over the currently selected vehicle",
								image: "paste", // SPR_G2_PASTE,
								disabled: compute(model._isEditDisabled, model._clipboard, (edit, clip) => edit || !clip),
								onClick: () => model._paste()
							}),
							button({
								width: buttonSize, height: buttonSize,
								tooltip: "Locate your vehicle when you've lost it (again)",
								image: 5167, // SPR_LOCATE,
								disabled: model._isEditDisabled,
								onClick: () => model._locate()
							}),
							toggle({
								width: buttonSize, height: buttonSize,
								tooltip: "Collapse/expand side window",
								image: compute(sideWindowActive, a => a ? 5161 : 5160), 
								isPressed: compute(sideWindowActive, a => a),
								onChange: (pressed) =>
									{
										(pressed) ? sideWindow.open() : sideWindow.close()
									}
							})
						]
					}),
				]),
				label({ // credits
					padding: [0, 0, 0, 0], // do not cover the resize corner
					text: "github.com/Basssiiie/\nOpenRCT2-RideVehicleEditor",
					tooltip: "Go to this URL to check for the latest updates",
					alignment: "centred",
					disabled: true,
				})
			]
		}),
		tab({
			image: { frameBase: 5201, frameCount: 4, frameDuration: 4, },
			onOpen: () => setWindowHeight(),
			content: [
				groupbox({
					text: "Options",
					content: [
						checkbox({
							text: "Side window sticks to main window",
							isChecked: stickySideWindow,
                            onChange: (checked) => {
                                stickySideWindow.set(checked);
                                setSticky(checked);
								setWindowHeight();
                            }
						}),
						horizontal([
							label({
								text: "Colour scheme:",
								width: "40%"
							}),
							dropdown({
								items: ["Rollercoaster Tycoon 1", "Rollercoaster Tycoon 2"],
								selectedIndex: compute(theme, t => t === "rct1" ? 0 : 1),
								onChange: (index) => {
									side = getWindow("Side window");
									switch (index) {
										case 0: {
                                            theme.set("rct1");
											if (main)
											main.colours = [Colour.BordeauxRed, Colour.Grey];
											if (side)
											side.colours = [Colour.BordeauxRed, Colour.Grey];
											break;
										}
										case 1: {
                                            theme.set("rct2");
											if (main)
											main.colours = [Colour.Grey, Colour.BordeauxRed]
											if (side)
											side.colours = [Colour.Grey, Colour.BordeauxRed]
											break;
										}
									}
								}
							})
						])
					]
				})
			]
		})
	]
})

export type Theme = "rct1" | "rct2";

export function setTheme(theme: Theme): void {
    return context.sharedStorage.set("pe.theme", theme);
}
export function getTheme(theme: Theme): Theme {
    return context.sharedStorage.get("pe.theme", theme);
}

function setSticky(isSticky: boolean): void {
    return context.sharedStorage.set("pe.sticky", isSticky);
}

function setWindowHeight(): void
{
	if (main) 
	{
		if (isEditRideTabOpen.get() && stickySideWindow.get()) 
		{
			main.height = 322;
		}
		else main.height = 230;
	}
}