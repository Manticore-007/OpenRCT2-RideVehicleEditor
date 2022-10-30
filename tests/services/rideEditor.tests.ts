/// <reference path="../../lib/openrct2.d.ts" />

import test from "ava";
import Mock from "openrct2-mocks";
import { RideLifeCycleFlags } from "../../lib/openrct2.extended";
import { ParkRide } from "../../src/objects/parkRide";
import { initActions } from "../../src/services/actions";
import { setBuildMonth, setCustomDesign, setExcitementRating, setFrozenRatings, setIndestructable, setIntensityRating, setNauseaRating } from "../../src/services/rideEditor";


function setupRideMock(rideId: number, permissions: PermissionType[] = [ "ride_properties" ]): Ride
{
	global.network = Mock.network({
		groups: [ Mock.playerGroup({ permissions })]
	});

	const ride = Mock.ride({ id: rideId });
	global.map = Mock.map({ rides: [ ride ]});
	return ride;
}
test.before(() =>
{
	global.context = Mock.context({
		getTypeIdForAction: () => 80
	});
	initActions();
});


test("Set excitement rating", t => {
	const ride = setupRideMock(25);

	setExcitementRating(new ParkRide(25), 567);
	t.is(ride.excitement, 567);

	setExcitementRating(new ParkRide(25), 432);
	t.is(ride.excitement, 432);
});


test("Set intensity rating", t => {
	const ride = setupRideMock(74);

	setIntensityRating(new ParkRide(74), 345);
	t.is(ride.intensity, 345);

	setIntensityRating(new ParkRide(74), 876);
	t.is(ride.intensity, 876);
});


test("Set nausea rating", t => {
	const ride = setupRideMock(11);

	setNauseaRating(new ParkRide(11), 1);
	t.is(ride.nausea, 1);

	setNauseaRating(new ParkRide(11), 999);
	t.is(ride.nausea, 999);
});


test("Freeze ratings", t => {
	const ride = setupRideMock(32);

	setFrozenRatings(new ParkRide(32), true);
	t.truthy(ride.lifecycleFlags & RideLifeCycleFlags.FixedRatings);

	setFrozenRatings(new ParkRide(32), false);
	t.falsy(ride.lifecycleFlags & RideLifeCycleFlags.FixedRatings);
});


test("Set build month", t => {
	const ride = setupRideMock(74);

	setBuildMonth(new ParkRide(74), 12);
	t.is(ride.buildDate, 12);

	setBuildMonth(new ParkRide(74), -66);
	t.is(ride.buildDate, -66);
});


test("Set custom design", t => {
	const ride = setupRideMock(54);

	setCustomDesign(new ParkRide(54), true);
	t.falsy(ride.lifecycleFlags & RideLifeCycleFlags.NotCustomDesign);

	setCustomDesign(new ParkRide(54), false);
	t.truthy(ride.lifecycleFlags & RideLifeCycleFlags.NotCustomDesign);
});


test("Set indestructable", t => {
	const ride = setupRideMock(37);

	setIndestructable(new ParkRide(37), false);
	t.falsy(ride.lifecycleFlags & RideLifeCycleFlags.Indestructable);

	setIndestructable(new ParkRide(37), true);
	t.truthy(ride.lifecycleFlags & RideLifeCycleFlags.Indestructable);
});