import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

import java.io.FileWriter;
import java.io.IOException;

public class SecretSanta {

    private static List<String> names = new ArrayList<>();

    public static void main(String[] args) {
        names.add("Anett Marvet");
        names.add("Eliisabet Toodo");
        names.add("Katariina Petermann");
        names.add("Leo Kask");
        names.add("Linnea Süvari");
        names.add("Markus Martin");
        names.add("Paul Kask");
        names.add("Stefan Carl Seppel");
        names.add("Karolina Louise Schultz");
        names.add("Ott Rahuvarm");

        Collections.shuffle(names);
        names.add(names.get(0));

        System.out.println(names);

        StringBuilder json = new StringBuilder();

        json.append("[\n");

        for (int i = 0; i < names.size() - 1; i++) {
            // System.out.println(names.get(i));
            String toName = names.get(i + 1);
            String encodedName = new String(Base64.getEncoder().encode(toName.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
            String name = names.get(i).split(" ")[0];

            json.append(String.format("{\"santa\": \"%s\", \"name\": \"%s\"}", name, encodedName));
            if (i < names.size() - 2) {
                json.append(",");
            }
            json.append("\n");
        }

        json.append("]");

        try (FileWriter file = new FileWriter("secret_santas.json")) {
            file.write(json.toString());  // Pretty print with an indent of 4 spaces
            System.out.println("Successfully written JSON to secret_santas.json");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
