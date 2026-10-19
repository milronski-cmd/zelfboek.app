import { NativeTabs } from "expo-router/native-tabs";
import { useKleuren } from "@/components/ui";

/** De vijf tabbladen: dezelfde als de onderbalk van de webapp op de telefoon. `sf` voor iOS, `md` (Material) voor Android. */
export default function TabLayout() {
  const k = useKleuren();
  return (
    <NativeTabs backgroundColor={k.wit} tintColor={k.primairTekst} labelStyle={{ selected: { color: k.primairTekst } }} labelVisibilityMode="labeled" indicatorColor={k.primairLicht} rippleColor={k.primairLicht}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Overzicht</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md="grid_view" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bank">
        <NativeTabs.Trigger.Label>Bank</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "building.columns", selected: "building.columns.fill" }} md="account_balance" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bonnen">
        <NativeTabs.Trigger.Label>Bonnen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "camera", selected: "camera.fill" }} md="photo_camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="facturen">
        <NativeTabs.Trigger.Label>Facturen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} md="description" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meer">
        <NativeTabs.Trigger.Label>Meer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
